/**
 * AutoResizeTextarea Tests
 * Story 6.7: Inline Text Editing
 *
 * AC #4: Auto-Expanding Textarea
 * - Textarea automatically expands to fit content
 * - Minimum height: 100px
 * - Maximum height: 400px
 * - Scrollbar appears only when content exceeds max height
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";

describe("AutoResizeTextarea (Story 6.7 AC #4)", () => {
  it("renders with default props", () => {
    render(<AutoResizeTextarea data-testid="textarea" />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toBeInTheDocument();
  });

  it("applies minHeight style", () => {
    render(<AutoResizeTextarea data-testid="textarea" minHeight={100} />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveStyle({ minHeight: "100px" });
  });

  it("applies maxHeight style", () => {
    render(<AutoResizeTextarea data-testid="textarea" maxHeight={400} />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveStyle({ maxHeight: "400px" });
  });

  it("uses default minHeight of 100px", () => {
    render(<AutoResizeTextarea data-testid="textarea" />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveStyle({ minHeight: "100px" });
  });

  it("uses default maxHeight of 400px", () => {
    render(<AutoResizeTextarea data-testid="textarea" />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveStyle({ maxHeight: "400px" });
  });

  it("has resize: none style to prevent manual resize", () => {
    render(<AutoResizeTextarea data-testid="textarea" />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveStyle({ resize: "none" });
  });

  it("accepts custom minHeight and maxHeight", () => {
    render(
      <AutoResizeTextarea data-testid="textarea" minHeight={50} maxHeight={200} />
    );

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveStyle({ minHeight: "50px" });
    expect(textarea).toHaveStyle({ maxHeight: "200px" });
  });

  it("handles controlled value changes", () => {
    const { rerender } = render(
      <AutoResizeTextarea data-testid="textarea" value="initial" onChange={() => {}} />
    );

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveValue("initial");

    rerender(
      <AutoResizeTextarea data-testid="textarea" value="updated" onChange={() => {}} />
    );

    expect(textarea).toHaveValue("updated");
  });

  it("calls onChange when user types", () => {
    const handleChange = vi.fn();
    render(<AutoResizeTextarea data-testid="textarea" onChange={handleChange} />);

    const textarea = screen.getByTestId("textarea");
    fireEvent.change(textarea, { target: { value: "typed content" } });

    expect(handleChange).toHaveBeenCalled();
  });

  it("applies custom className", () => {
    render(
      <AutoResizeTextarea data-testid="textarea" className="custom-class" />
    );

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveClass("custom-class");
  });

  it("forwards ref correctly", () => {
    const ref = vi.fn();
    render(<AutoResizeTextarea ref={ref} data-testid="textarea" />);

    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTextAreaElement);
  });

  it("accepts standard textarea attributes", () => {
    render(
      <AutoResizeTextarea
        data-testid="textarea"
        placeholder="Enter text..."
        disabled
        maxLength={100}
      />
    );

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveAttribute("placeholder", "Enter text...");
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute("maxLength", "100");
  });

  it("preserves line breaks in value", () => {
    const multilineText = "Line 1\nLine 2\nLine 3";
    render(
      <AutoResizeTextarea
        data-testid="textarea"
        value={multilineText}
        onChange={() => {}}
      />
    );

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveValue(multilineText);
  });

  it("handles empty value gracefully", () => {
    render(<AutoResizeTextarea data-testid="textarea" value="" onChange={() => {}} />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveValue("");
    expect(textarea).toHaveStyle({ minHeight: "100px" });
  });

  it("has focus-visible ring styles", () => {
    render(<AutoResizeTextarea data-testid="textarea" />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveClass("focus-visible:ring-2");
    expect(textarea).toHaveClass("focus-visible:ring-ring");
  });

  it("has disabled styles when disabled", () => {
    render(<AutoResizeTextarea data-testid="textarea" disabled />);

    const textarea = screen.getByTestId("textarea");
    expect(textarea).toHaveClass("disabled:cursor-not-allowed");
    expect(textarea).toHaveClass("disabled:opacity-50");
  });
});
