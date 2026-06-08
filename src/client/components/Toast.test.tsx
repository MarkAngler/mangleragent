// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

function Harness() {
  const toast = useToast();
  return (
    <button onClick={() => toast({ tone: "good", title: "Connected — 2 tools", body: "read_file, write_file" })}>
      push
    </button>
  );
}

function renderWithToast() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  it("renders title and body as selectable text outside any button", async () => {
    const user = userEvent.setup();
    renderWithToast();
    await user.click(screen.getByText("push"));

    const body = screen.getByText("read_file, write_file");
    expect(screen.getByText("Connected — 2 tools")).toBeInTheDocument();
    expect(body).toBeInTheDocument();
    expect(body.closest("button")).toBeNull();
  });

  it("dismisses when the close button is clicked", async () => {
    const user = userEvent.setup();
    renderWithToast();
    await user.click(screen.getByText("push"));

    await user.click(screen.getByRole("button", { name: "close" }));

    expect(screen.queryByText("read_file, write_file")).not.toBeInTheDocument();
  });

  it("dismisses when clicking outside the toast stack", async () => {
    const user = userEvent.setup();
    renderWithToast();
    await user.click(screen.getByText("push"));
    expect(screen.getByText("read_file, write_file")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("read_file, write_file")).not.toBeInTheDocument();
  });
});
