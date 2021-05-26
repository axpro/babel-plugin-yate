const fs = require("fs");
const _ = require("lodash");
const getTranslation = require("./getTranslation");
const getTranslationsObject = require("./getTranslationsObject");
const constants = require("./constants");

module.exports = function ({ types }) {
  return {
    pre() {
      const {
        translationsInput = constants.DEFAULT_TRANSLATIONS_INPUT,
        translationsOutput = constants.DEFAULT_TRANSLATIONS_OUTPUT,
      } = this.opts;

      const translationsInputObject = getTranslationsObject(translationsInput);
      const translationsOutputObject =
        getTranslationsObject(translationsOutput);

      this.outputTranslation = [];

      this.translationsInput = translationsInput;
      this.translationsInputObject = translationsInputObject;

      this.translationsOutput = translationsOutput;
      this.translationsOutputObject = translationsOutputObject;
    },
    post() {
      const { missingText = constants.DEFAULT_MISSING_TEXT } = this.opts;

      if (this.outputTranslation.length > 0) {
        let newData = { ...this.translationsOutputObject };

        this.outputTranslation.forEach((key) => {
          const formattedKey = key.string.split("${").join("{");
          const stringProp = formattedKey;
          const stringValue = key.notFound
            ? missingText + formattedKey
            : formattedKey;

          // console.log(stringProp, key.context, stringValue);

          const newValues = newData[stringProp]
            ? {
                ...newData[stringProp],
                ...{ [key.context]: stringValue },
              }
            : {
                [key.context]: stringValue,
              };

          const sortedNewValues = _(newValues)
            .toPairs()
            .sortBy(0)
            .fromPairs()
            .value();

          newData[stringProp] = sortedNewValues;
        });

        const sortedNewData = _(newData)
          .toPairs()
          .sortBy(0)
          .fromPairs()
          .value();

        const outputString = JSON.stringify(sortedNewData, null, 2);
        fs.writeFileSync(this.translationsOutput, outputString);
      }
    },
    visitor: {
      TaggedTemplateExpression(path, state) {
        const {
          node: { tag, quasi },
        } = path;
        const { file, opts: options } = state;

        const { tagName = constants.DEFAULT_TAGNAME } = options;

        const isTag = types.isIdentifier(tag, { name: tagName });
        const isCallExpression = types.isCallExpression(tag);

        const hasCallee = types.isIdentifier(tag.callee, {
          name: tagName,
        });

        // Skip if translation isn't needed
        if (!isTag && !isCallExpression && !hasCallee) {
          return;
        }

        // Get source file code
        const fileCode = file.code;

        const templateLiteralEnclosed = fileCode.substring(
          quasi.start,
          quasi.end
        );

        // Extract template literal without back-tick enclosure
        const templateLiteral = templateLiteralEnclosed.substring(
          1,
          templateLiteralEnclosed.length - 1
        );

        let context = undefined;

        // Check if tag
        if (isTag) {
          // Set context as default
          context = constants.DEFAULT_TRANSLATION_CONTEXT;
        }

        // Check if call expression
        if (isCallExpression) {
          // Throw if we have more than 1 context
          if (tag.arguments.length > 1) {
            throw path.buildCodeFrameError(
              "Can handle only 1 context argument."
            );
          }

          // We have 1 context, hooray
          if (tag.arguments.length === 1) {
            // Throw is context argument is not a string literal
            if (!types.isStringLiteral(tag.arguments[0])) {
              throw new Error("Context argument must be a string literal.");
            }

            // Set context
            context = tag.arguments[0].value;
          }

          // If we don't have a context argument assume default context
          if (tag.arguments.length === 0) {
            context = constants.DEFAULT_TRANSLATION_CONTEXT;
          }
        }

        // Get translated template literal
        let templateLiteralTranslation;

        // Get translation
        templateLiteralTranslation = getTranslation(
          templateLiteral,
          context,
          this.translationsInputObject
        );

        // Compose source code replacement
        const sourceString = "`" + templateLiteralTranslation.string + "`";

        this.outputTranslation.push({
          string: templateLiteral,
          context,
          notFound: templateLiteralTranslation.notFound,
        });

        // Replace with translation in source code
        path.replaceWithSourceString(sourceString);
      },
    },
  };
};
