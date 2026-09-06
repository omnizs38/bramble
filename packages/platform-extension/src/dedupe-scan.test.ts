import type { SubdomainMatchMode } from "@core/adapters/autofill";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHostnameMatcher, type HostnameMatchable, hostnameMatches } from "./dedupe";
import * as psl from "./etld1";

afterEach(() => vi.restoreAllMocks());
describe("query-scoped hostname matcher", () => {
	it("parses the page domain once for 1000 index entries", () => {
		const parse = vi.spyOn(psl, "etld1");
		const matches = createHostnameMatcher("PAGE.example.com");
		for (let i = 0; i < 1000; i++)
			expect(matches({ hostnames: [`account${i}.example.com`] })).toBe(true);
		expect(parse.mock.calls.filter(([host]) => host === "page.example.com")).toHaveLength(1);
		expect(parse).toHaveBeenCalledTimes(1001);
	});
	it("does not parse domains for exact or subdomain policies", () => {
		const parse = vi.spyOn(psl, "etld1");
		const matches = createHostnameMatcher("mail.example.com");
		expect(matches({ hostnames: ["mail.example.com"], subdomainMatch: "exact" })).toBe(true);
		expect(matches({ hostnames: ["example.com"], subdomainMatch: "subdomain" })).toBe(true);
		expect(parse).not.toHaveBeenCalled();
	});
	it("isolates page state and reads entry changes rather than caching credentials", () => {
		const a = createHostnameMatcher("a.example.com"),
			b = createHostnameMatcher("other.org");
		const entry: HostnameMatchable = { hostnames: ["example.com"] };
		expect(a(entry)).toBe(true);
		expect(b(entry)).toBe(false);
		entry.hostnames = ["other.org"];
		expect(a(entry)).toBe(false);
		expect(b(entry)).toBe(true);
		entry.subdomainMatch = "exact";
		entry.hostnames = ["www.other.org"];
		expect(b(entry)).toBe(false);
	});
	it.each([
		"com.sg",
		"co.za",
		"com.br",
		"com.mx",
		"co.id",
		"co.th",
		"com.tr",
		"co.kr",
		"com.hk",
		"com.tw",
		"co.il",
		"k12.ak.us",
		"a.ck",
	])("preserves credential isolation for %s", (suffix) => {
		expect(createHostnameMatcher(`evil.${suffix}`)({ hostnames: [`bank.${suffix}`] })).toBe(false);
	});
	it("keeps full PSL wildcard/exception behavior", () => {
		expect(createHostnameMatcher("mail.www.ck")({ hostnames: ["www.ck"] })).toBe(true);
		expect(createHostnameMatcher("evil.a.ck")({ hostnames: ["bank.a.ck"] })).toBe(false);
	});
	it("matches an independent legacy algorithm across policies and edge cases", () => {
		const domain = (h: string) => psl.etld1(h) ?? h;
		const hosts = [
			"EXAMPLE.com",
			"mail.example.com",
			"evil-example.com",
			"my_host.example.com",
			"localhost",
			"127.0.0.1",
			"::1",
			"a.unknown",
			"a.com.sg",
			"b.com.sg",
			"www.ck",
			"mail.www.ck",
			"a.kawasaki.jp",
			"city.kawasaki.jp",
			"a.city.kawasaki.jp",
			"",
			"example.com.",
		];
		for (const page of hosts) {
			const matches = createHostnameMatcher(page);
			for (const host of hosts)
				for (const policy of [undefined, "exact", "subdomain", "etld1", "unknown"]) {
					const p = page.toLowerCase(),
						h = host.toLowerCase();
					const expected =
						policy === "exact"
							? h === p
							: policy === "subdomain"
								? p === h || p.endsWith(`.${h}`)
								: domain(h) === domain(p);
					const entry = { hostnames: [host], subdomainMatch: policy as SubdomainMatchMode };
					expect(matches(entry)).toBe(expected);
					expect(hostnameMatches(entry, page)).toBe(expected);
				}
		}
	});
});
