import { assert } from "chai";
import { callLLM } from "../src/modules/llmClient.ts";
import { config, homepage } from "../package.json";

type FetchCall = {
  url: string;
  init: RequestInit;
};

function installPrefs(values: Record<string, string>) {
  globalThis.Zotero = {
    Prefs: {
      get(key: string) {
        return values[key.replace(`${config.prefsPrefix}.`, "")];
      },
    },
  } as typeof Zotero;
}

function installFetch() {
  const calls: FetchCall[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "A compact summary.",
                  annotations: [],
                }),
              },
            },
          ],
        };
      },
    } as Response;
  };
  return calls;
}

describe("llmClient OpenRouter requests", function () {
  let previousFetch: typeof fetch;
  let previousZotero: typeof Zotero;
  let previousAbortController: typeof AbortController;

  beforeEach(function () {
    previousFetch = globalThis.fetch;
    previousZotero = globalThis.Zotero;
    previousAbortController = globalThis.AbortController;
  });

  afterEach(function () {
    globalThis.fetch = previousFetch;
    globalThis.Zotero = previousZotero;
    globalThis.AbortController = previousAbortController;
  });

  it("normalizes the OpenRouter API base URL and sends attribution headers", async function () {
    installPrefs({
      apiKey: "sk-openrouter",
      apiBaseUrl: "https://openrouter.ai/api/",
      modelName: "deepseek/deepseek-v4-flash",
    });
    const calls = installFetch();

    await callLLM("paper text");

    assert.lengthOf(calls, 1);
    assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
    assert.deepInclude(calls[0].init.headers as Record<string, string>, {
      Authorization: "Bearer sk-openrouter",
      "Content-Type": "application/json",
      "HTTP-Referer": homepage,
      "X-OpenRouter-Title": config.addonName,
    });
  });

  it("does not duplicate v1 when the configured base URL already includes it", async function () {
    installPrefs({
      apiKey: "sk-openrouter",
      apiBaseUrl: "https://openrouter.ai/api/v1/",
      modelName: "deepseek/deepseek-v4-flash",
    });
    const calls = installFetch();

    await callLLM("paper text");

    assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  });

  it("does not require AbortController in the Zotero sandbox", async function () {
    installPrefs({
      apiKey: "sk-openrouter",
      apiBaseUrl: "https://openrouter.ai/api",
      modelName: "deepseek/deepseek-v4-flash",
    });
    const calls = installFetch();
    delete (globalThis as any).AbortController;

    await callLLM("paper text");

    assert.lengthOf(calls, 1);
    assert.notProperty(calls[0].init, "signal");
  });

  it("asks the model to summarize every provided paragraph by paragraph ID", async function () {
    installPrefs({
      apiKey: "sk-openrouter",
      apiBaseUrl: "https://openrouter.ai/api",
      modelName: "deepseek/deepseek-v4-flash",
    });
    const calls = installFetch();

    await callLLM(
      [
        "[Paragraph p0001 | Page 1]",
        "This paragraph introduces the central method.",
        "",
        "[Paragraph p0002 | Page 2]",
        "This paragraph explains the main limitation.",
      ].join("\n"),
    );

    const body = JSON.parse(calls[0].init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };

    assert.include(body.messages[0].content, "one annotation for every");
    assert.include(body.messages[0].content, "paragraphId");
    assert.include(body.messages[0].content, "whole-paper context");
    assert.include(body.messages[1].content, "[Paragraph p0001 | Page 1]");
    assert.include(body.messages[1].content, "[Paragraph p0002 | Page 2]");
  });

  it("points invalid base URL errors at the OpenRouter base URL", async function () {
    installPrefs({
      apiKey: "sk-openrouter",
      apiBaseUrl: "openrouter.ai/api",
      modelName: "deepseek/deepseek-v4-flash",
    });
    installFetch();

    let error: Error | undefined;
    try {
      await callLLM("paper text");
    } catch (err) {
      error = err as Error;
    }

    assert.instanceOf(error, Error);
    assert.include(error?.message, "https://openrouter.ai/api");
    assert.include(error?.message, "adds /v1/chat/completions");
  });

  it("mentions OpenRouter JSON-mode model support in API errors", async function () {
    installPrefs({
      apiKey: "sk-openrouter",
      apiBaseUrl: "https://openrouter.ai/api",
      modelName: "deepseek/deepseek-v4-flash",
    });
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 400,
        async text() {
          return "response_format is not supported by this model";
        },
      }) as Response;

    let error: Error | undefined;
    try {
      await callLLM("paper text");
    } catch (err) {
      error = err as Error;
    }

    assert.instanceOf(error, Error);
    assert.include(error?.message, "JSON response_format");
    assert.include(error?.message, "OpenRouter");
  });
});
