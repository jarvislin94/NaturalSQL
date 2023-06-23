import { verbose } from "sqlite3";
import {
  ChatCompletionRequestMessage,
  ChatCompletionResponseMessageRoleEnum,
  Configuration,
  OpenAIApi,
} from "openai";
import { ChatCompletionRequestMessageRoleEnum } from "openai";
import prompts from "prompts";
import { exit } from "node:process";
import chalk from "chalk";

import { print } from "../utils/print";
import { rapidApiKey, basePath, rapidApiHost } from "../config.json";

//@ts-ignore
const util = require("util");

type TableDict = {
  tableName: string;
  columnNames: string[];
};

const configuration = new Configuration({
  // if you use third-party proxy chatGPT api then you can set this basePath
  // default using OpenAI official API endpoint
  basePath: basePath,
  baseOptions: {
    headers: {
      "X-RapidAPI-Host": rapidApiHost,
      "X-RapidAPI-Key": rapidApiKey,
    },
  },
});

const openai = new OpenAIApi(configuration);

const sqlite3 = verbose();

const db = new sqlite3.Database("./db/chinook.db", async (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log("\nConnected to the chinook database! ✅ \n");
  await collectUserInput();
});

// openai

async function chatGPT(messages, functions) {
  const chatCompletion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-0613",
    messages: messages,
    functions: functions,
  });

  const data = chatCompletion.data;
  return data;
}

// sqlite
const getTableNames = () =>
  new Promise((resolve, reject) => {
    const callback = (err, rows) => {
      if (err) throw err;
      const names = rows.map((item) => item.name);
      // console.log(names);
      resolve(names);
    };
    db.all(
      `SELECT name FROM sqlite_schema WHERE type='table' AND 
    name NOT LIKE 'sqlite_%';`,
      callback
    );
  });

const getColumnNames = (tableName: string) =>
  new Promise<string[]>((resolve, reject) => {
    db.all(`PRAGMA table_info('${tableName}');`, (err, rows: any) => {
      if (err) throw err;
      const names = rows.map((item) => item.name);
      // console.log(names);
      resolve(names);
    });
  });

const getDatabaseInfo = async () => {
  const tableNames = (await getTableNames()) as string[];
  const tableDicts: TableDict[] = [];
  for (const table of tableNames) {
    const columnNames = await getColumnNames(table);
    tableDicts.push({ tableName: table, columnNames: columnNames });
  }
  return tableDicts;
};

const getDatabaseSchemaString = async () => {
  const tableDicts = await getDatabaseInfo();
  let arr = [];
  tableDicts.forEach((dict) => {
    const temp = [
      "\n",
      "Table:",
      dict.tableName,
      "\n",
      "Columns:",
      dict.columnNames.join(","),
    ];
    arr = [...arr, ...temp];
  });
  const databaseSchemaString = arr.join(" ");
  return databaseSchemaString;
};

const askDatabase = async (query) => {
  return new Promise((resolve, reject) => {
    db.all(query, (err, rows) => {
      if (err) throw err;
      // console.log("execute response:\n", rows);
      resolve(rows);
    });
  });
};

const executeFunctionCall = async (message) => {
  let result = null;
  if (message["function_call"]["name"] === "askDatabase") {
    const query = JSON.parse(
      message["function_call"]["arguments"].replaceAll("\n", "")
    )["query"];
    result = await askDatabase(query);
  }
  return result;
};

// reference: https://platform.openai.com/docs/guides/gpt/function-calling
const functions = (databaseSchemaString) => [
  {
    name: "askDatabase",
    description:
      "Use this function to answer user questions about music. Output should be a fully formed SQL query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: `SQL query extracting info to answer the user's question.\nSQL should be written using this database schema:\n${databaseSchemaString}\nThe query should be returned in plain text, not in JSON.`,
        },
      },
      required: ["query"],
    },
  },
];

// messages for testing
const messages: ChatCompletionRequestMessage[] = [];
messages.push({
  role: ChatCompletionRequestMessageRoleEnum.System,
  content:
    "Answer user questions by generating SQL queries against the Chinook Music Database.",
});

// main app
const start = async () => {
  const str = await getDatabaseSchemaString();
  const res = await chatGPT(messages, functions(str));
  const message = res.choices[0].message;
  messages.push(message);
  if (message.function_call) {
    const result = await executeFunctionCall(message);
    messages.push({
      role: ChatCompletionResponseMessageRoleEnum.Function,
      name: message.function_call.name,
      content: util.inspect(result),
    });
  }
  // console.log(messages);
  print(messages);
  await collectUserInput();
};

// collect user inputs
const collectUserInput = async () => {
  const response = await prompts(
    {
      type: "text",
      name: "message",
      message: chalk.bgYellow.bold("Hi there! How can I assist you?"),
    },
    {
      onCancel: () => {
        console.log(chalk.bgYellow.bold("\n Have a good day! Bye :) \n"));
        exit();
      },
    }
  );
  messages.push({
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: response.message,
  });
  await start();
};
