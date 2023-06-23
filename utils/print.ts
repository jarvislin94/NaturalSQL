import chalk from "chalk";
import {
  ChatCompletionResponseMessageRoleEnum,
  type ChatCompletionResponseMessage,
  ChatCompletionRequestMessage,
} from "openai";

const log = console.log;

export const print = (
  messages: (ChatCompletionResponseMessage & ChatCompletionRequestMessage)[]
) => {
  //console.log(messages);
  messages.forEach(({ role, content, function_call, name }) => {
    switch (role) {
      case ChatCompletionResponseMessageRoleEnum.System: {
        log("\n" + chalk.bgWhite.black(`System: ${content}`) + "\n");
        break;
      }
      case ChatCompletionResponseMessageRoleEnum.Assistant: {
        if (function_call) {
          log(
            chalk.magenta(
              `Assist: call function\n ${JSON.stringify(
                function_call,
                null,
                4
              )}`
            ) + "\n"
          );
        } else {
          log(chalk.magenta(`Assist: ${content}`) + "\n");
        }

        break;
      }
      case ChatCompletionResponseMessageRoleEnum.Function: {
        log(chalk.magenta(`Function(${name}):` + content) + "\n");
        break;
      }
      case ChatCompletionResponseMessageRoleEnum.User:
      default: {
        log(chalk.green(`User: ${content}`) + "\n");
      }
    }
  });
};
