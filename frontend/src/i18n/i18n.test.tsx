import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import en from "./en";
import fr from "./fr";
import de from "./de";
import { getLocale, setLanguage, t } from "./index";
import { I18nProvider, useI18n } from "./I18nContext";
import { ProfileMenu } from "../components/ProfileMenu";
import { MemoryRouter } from "react-router-dom";

const auth = {
  user: { id: "u1", email: "me@example.com", user_metadata: {} } as Record<string, unknown>,
  displayName: "me",
  initials: "ME",
  signOut: vi.fn(),
  saveLanguage: vi.fn(),
  avatarUrl: vi.fn().mockResolvedValue(""),
};
vi.mock("../auth/AuthContext", () => ({ useAuth: () => auth }));

afterEach(() => {
  setLanguage("en");
  window.localStorage.clear();
  auth.saveLanguage.mockReset().mockResolvedValue(undefined);
  auth.signOut.mockReset();
});

describe("dictionaries", () => {
  it("define the same keys in every language, with no empty text", () => {
    for (const dict of [fr, de]) {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
      for (const text of Object.values(dict)) expect(text.trim()).not.toBe("");
    }
  });

  it("use the same {placeholders} as English", () => {
    const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const dict of [fr, de]) {
      for (const key of Object.keys(en) as (keyof typeof en)[]) expect(names(dict[key])).toBe(names(en[key]));
    }
  });
});

describe("t()", () => {
  it("translates, fills placeholders and follows the current language", () => {
    expect(t("account.currentEmail", { email: "a@b.c" })).toBe("Currently a@b.c");
    setLanguage("fr");
    expect(t("account.currentEmail", { email: "a@b.c" })).toBe("Actuellement a@b.c");
    expect(getLocale()).toBe("fr-FR");
    setLanguage("de");
    expect(t("nav.collections")).toBe("Sammlungen");
  });

  it("ignores unknown languages and leaves unknown placeholders alone", () => {
    setLanguage("xx");
    expect(t("nav.books")).toBe("Books");
    expect(t("account.currentEmail")).toBe("Currently {email}");
  });
});

describe("I18nProvider", () => {
  function Probe() {
    const { lang, setLang, t } = useI18n();
    return (
      <>
        <p data-testid="text">{t("nav.books")}</p>
        <p data-testid="lang">{lang}</p>
        <button onClick={() => setLang("fr")}>fr</button>
      </>
    );
  }

  it("applies a language at once and remembers it on this device", () => {
    const { unmount } = render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId("text").textContent).toBe("Books");

    fireEvent.click(screen.getByText("fr"));
    expect(screen.getByTestId("text").textContent).toBe("Livres");
    expect(document.documentElement.lang).toBe("fr");
    expect(window.localStorage.getItem("libray.language")).toBe("fr");
    unmount();

    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId("lang").textContent).toBe("fr");
  });
});

describe("ProfileMenu", () => {
  const renderMenu = () =>
    render(
      <MemoryRouter>
        <I18nProvider>
          <ProfileMenu />
        </I18nProvider>
      </MemoryRouter>
    );

  it("opens with the user, a language select, settings and sign out, and closes on Escape", () => {
    renderMenu();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByRole("menu")).not.toBeNull();
    expect(screen.getByText("me@example.com")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /Settings/ }).getAttribute("href")).toBe("/account");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("changes the language, translates the menu and saves it to the account", async () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "de" } });

    expect(await screen.findByRole("menuitem", { name: /Einstellungen/ })).not.toBeNull();
    await waitFor(() => expect(auth.saveLanguage).toHaveBeenCalledWith("de"));
  });

  it("keeps the new language but reports it when saving to the account fails", async () => {
    auth.saveLanguage.mockRejectedValue(new Error("offline"));
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } });

    expect(await screen.findByText("Impossible d’enregistrer votre langue : offline")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /Paramètres/ })).not.toBeNull();
  });

  it("signs out from the menu", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Profile menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    expect(auth.signOut).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
