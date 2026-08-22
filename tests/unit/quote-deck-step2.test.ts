import { describe, expect, it } from "vitest";
import { chooseLeastShownId, chooseQuote, type QuoteCandidate, type QuoteHistory } from "@/lib/quote-deck";
import { isAllowedQuoteSource } from "@/lib/planner-service";

function zero() { return 0; }

describe("quote and reflection decks", () => {
  const quotes: QuoteCandidate[] = [
    ...Array.from({ length: 24 }, (_, index) => ({ id: `h${index}`, category: "HUMOR", author: `Автор ${index % 8}` })),
    ...Array.from({ length: 18 }, (_, index) => ({ id: `m${index}`, category: "MOTIVATION", author: `Мотиватор ${index % 6}` })),
    ...Array.from({ length: 18 }, (_, index) => ({ id: `p${index}`, category: "PHILOSOPHY", author: `Философ ${index % 6}` }))
  ];

  it("shows every active quote exactly once in a cycle with 40/30/30 totals", () => {
    const history: QuoteHistory[] = [];
    for (let index = 0; index < 60; index += 1) {
      const selected = chooseQuote(quotes, history, zero);
      expect(selected).not.toBeNull();
      history.push({ quoteId: selected!.quote.id, cycleNumber: selected!.cycleNumber, author: selected!.quote.author, category: selected!.quote.category });
    }
    expect(new Set(history.map((item) => item.quoteId))).toHaveLength(60);
    expect(history.filter((item) => item.category === "HUMOR")).toHaveLength(24);
    expect(history.filter((item) => item.category === "MOTIVATION")).toHaveLength(18);
    expect(history.filter((item) => item.category === "PHILOSOPHY")).toHaveLength(18);
    expect(chooseQuote(quotes, history, zero)?.cycleNumber).toBe(2);
  });

  it("excludes hidden candidates and terminates when all are hidden", () => {
    expect(chooseQuote([], [], zero)).toBeNull();
    const active = quotes.filter((quote) => quote.id !== "h0");
    const picked = chooseQuote(active, [], zero);
    expect(picked?.quote.id).not.toBe("h0");
  });

  it("does not let favorite state affect selection and rotates prompts without repeats", () => {
    const ids = ["q1", "q2", "q3"];
    const shown: string[] = [];
    for (let index = 0; index < ids.length; index += 1) {
      const id = chooseLeastShownId(ids, shown, zero);
      expect(id).not.toBeNull(); shown.push(id!);
    }
    expect(new Set(shown)).toHaveLength(3);
    expect(chooseLeastShownId(ids, shown, zero)).toBe("q1");
  });

  it("avoids adjacent authors when the selected category has an alternative", () => {
    const active = [
      { id: "h1", category: "HUMOR", author: "Один" },
      { id: "h2", category: "HUMOR", author: "Другой" }
    ];
    const selected = chooseQuote(active, [{ quoteId: "old", cycleNumber: 1, author: "Один", category: "HUMOR" }], zero);
    expect(selected?.quote.author).toBe("Другой");
  });

  it("allows only the local seed source host", () => {
    expect(isAllowedQuoteSource("https://www.gutenberg.org/files/308/308-h/308-h.htm")).toBe(true);
    expect(isAllowedQuoteSource("http://www.gutenberg.org/files/308/308-h/308-h.htm")).toBe(false);
    expect(isAllowedQuoteSource("https://www.gutenberg.org.evil.example/book")).toBe(false);
    expect(isAllowedQuoteSource("not-a-url")).toBe(false);
  });
});
