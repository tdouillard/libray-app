import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResetPasswordPage } from "./ResetPasswordPage";

const auth = { completeRecovery: vi.fn(), skipRecovery: vi.fn() };
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth.completeRecovery.mockReset().mockResolvedValue(undefined);
  auth.skipRecovery.mockReset();
});

describe("ResetPasswordPage", () => {
  it("checks the password before saving it", async () => {
    render(<ResetPasswordPage />);
    const [pw, confirm] = [screen.getByLabelText("New password"), screen.getByLabelText("Confirm password")];

    fireEvent.change(pw, { target: { value: "abc" } });
    fireEvent.change(confirm, { target: { value: "abc" } });
    fireEvent.submit(pw.closest("form")!);
    expect(await screen.findByText(/too short/)).not.toBeNull();

    fireEvent.change(pw, { target: { value: "secret1" } });
    fireEvent.change(confirm, { target: { value: "secret2" } });
    fireEvent.submit(pw.closest("form")!);
    expect(await screen.findByText("Passwords do not match.")).not.toBeNull();
    expect(auth.completeRecovery).not.toHaveBeenCalled();
  });

  it("saves a valid new password", async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(auth.completeRecovery).toHaveBeenCalledWith("secret1"));
  });

  it("shows the server error and lets the user skip", async () => {
    auth.completeRecovery.mockRejectedValue(new Error("The new password must differ from the current one."));
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The new password must differ from the current one.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(auth.skipRecovery).toHaveBeenCalled();
  });
});
