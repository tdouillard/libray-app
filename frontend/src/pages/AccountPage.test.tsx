import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountPage } from "./AccountPage";

const auth = {
  user: { id: "u1", email: "me@example.com", user_metadata: { username: "Me" } } as Record<string, unknown>,
  displayName: "Me",
  initials: "ME",
  saveProfile: vi.fn(),
  requestEmailCode: vi.fn(),
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
  signOutOthers: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  avatarUrl: vi.fn(),
  deleteAccount: vi.fn(),
};

vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

beforeEach(() => {
  for (const v of Object.values(auth)) if (typeof v === "function") (v as ReturnType<typeof vi.fn>).mockReset();
  auth.avatarUrl.mockResolvedValue("");
  for (const k of ["saveProfile", "requestEmailCode", "changeEmail", "changePassword", "signOutOthers", "deleteAccount"] as const) {
    auth[k].mockResolvedValue(undefined);
  }
});

describe("AccountPage", () => {
  it("saves the username only once it changed", async () => {
    render(<AccountPage />);
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "  Alice " } });
    fireEvent.click(save);

    await waitFor(() => expect(auth.saveProfile).toHaveBeenCalledWith("  Alice "));
    expect(await screen.findByText("Profile saved.")).not.toBeNull();
  });

  it("changes the email in two steps: code first, then the new address with the code", async () => {
    render(<AccountPage />);
    const input = screen.getByLabelText("New address");
    const sendCode = () => fireEvent.click(screen.getAllByRole("button", { name: "Send code" })[0]);

    fireEvent.change(input, { target: { value: "me@example.com" } });
    sendCode();
    expect(await screen.findByText("Enter an address different from your current one.")).not.toBeNull();
    expect(auth.requestEmailCode).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "new@example.com" } });
    sendCode();
    await waitFor(() => expect(auth.requestEmailCode).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText(/Verification code/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    await waitFor(() => expect(auth.changeEmail).toHaveBeenCalledWith("new@example.com", "123456"));
  });

  it("validates the new password before asking for a code", async () => {
    render(<AccountPage />);
    const [pw, confirm] = [screen.getByLabelText("New password"), screen.getByLabelText("Confirm new password")];

    fireEvent.change(pw, { target: { value: "abc" } });
    fireEvent.change(confirm, { target: { value: "abc" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Send code" })[1]);
    expect(await screen.findByText(/6 characters minimum/)).not.toBeNull();

    fireEvent.change(pw, { target: { value: "secret1" } });
    fireEvent.change(confirm, { target: { value: "secret2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Send code" })[1]);
    expect(await screen.findByText("The two passwords do not match.")).not.toBeNull();
    expect(auth.requestEmailCode).not.toHaveBeenCalled();
  });

  it("only enables account deletion once the email is typed", async () => {
    render(<AccountPage />);
    const del = screen.getByRole("button", { name: "Delete my account" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type me@example.com to confirm/), { target: { value: "ME@example.com" } });
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    await waitFor(() => expect(auth.deleteAccount).toHaveBeenCalledTimes(1));
  });

  it("rejects a photo of the wrong type without uploading", async () => {
    render(<AccountPage />);
    const input = screen.getByTestId("photo-input");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    expect(await screen.findByText("Use a JPEG, PNG or WebP picture.")).not.toBeNull();
    expect(auth.uploadAvatar).not.toHaveBeenCalled();
  });

  it("signs out the other devices", async () => {
    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));
    expect(await screen.findByText("Other devices have been signed out.")).not.toBeNull();
  });
});
