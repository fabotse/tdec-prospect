import { describe, it, expect } from "vitest";
import { linkedInProfileUrl } from "@/lib/agent/linkedin-profile-url";

describe("linkedInProfileUrl (FEL-77)", () => {
  it.each([
    ["https://www.linkedin.com/in/ana", "https://www.linkedin.com/in/ana"],
    ["http://linkedin.com/in/ana", "http://linkedin.com/in/ana"],
    ["  https://br.linkedin.com/in/ana  ", "https://br.linkedin.com/in/ana"],
    ["HTTPS://WWW.LINKEDIN.COM/in/ana", "HTTPS://WWW.LINKEDIN.COM/in/ana"],
  ])("aceita %s", (input, expected) => {
    expect(linkedInProfileUrl(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    42,
    {},
    "",
    "   ",
    "linkedin.com/in/ana",
    "ftp://linkedin.com/in/ana",
    "javascript:alert(1)",
    "https://example.com/in/ana",
    "https://linkedin.com.evil.io/in/ana",
    "https://evillinkedin.com/in/ana",
    "https://user:pass@linkedin.com/in/ana",
    "https://www.linkedin.com",
    "https://www.linkedin.com/",
    "https://",
  ])("rejeita %s", (input) => {
    expect(linkedInProfileUrl(input)).toBeNull();
  });
});
