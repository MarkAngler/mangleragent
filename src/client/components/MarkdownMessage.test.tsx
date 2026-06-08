// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownMessage } from "./MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders bold, inline code, and lists", () => {
    render(<MarkdownMessage text={"**KPIs**\n\nstatus `not_started`\n\n- one\n- two"} />);

    expect(screen.getByText("KPIs").tagName).toBe("STRONG");
    expect(screen.getByText("not_started").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("applies the passed className alongside markdown-body", () => {
    const { container } = render(<MarkdownMessage text="hi" className="mt-2" />);

    expect(container.firstChild).toHaveClass("markdown-body", "mt-2");
  });
});
