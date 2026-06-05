// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview } from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders markdown headings, emphasis, lists, and GFM task lists", () => {
    render(<MarkdownPreview source={"# Title\n\n**bold** text\n\n- one\n- two\n\n- [ ] todo"} />);

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("shows a placeholder when there is nothing to preview", () => {
    render(<MarkdownPreview source="   " />);

    expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument();
  });
});
