import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { loadMessages } from "@src/i18n/load-messages";
import { ActionMenu } from "@src/components/ui/action-menu";
import { Field } from "@src/components/ui/field";
import { Notice } from "@src/components/ui/notice";
import { ConfirmDialog } from "@src/components/ui/confirm-dialog";
import { StatusChip, ProtectedChip, NeedsReviewChip } from "./status-chip";
import { LocaleTabs } from "./locale-tabs";
import { SortableList } from "./sortable-list";
import { PickerDialog } from "./picker-dialog";
import { SlugField } from "./slug-field";
import { ErrorSummary } from "./error-summary";

const esMessages = loadMessages("es-AR");

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="es-AR" messages={esMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Shared UI & content primitives (Checkpoint 2)", () => {
  it("renders Field with required-to-publish marker, hint, and alert error", () => {
    render(
      <Field
        label="Título"
        htmlFor="title-input"
        fieldPath="title.es-AR"
        requiredToPublish
        requiredMarkLabel="necesario para publicar"
        hint="Aparece en el encabezado"
        error="Falta el título."
      >
        <input id="title-input" />
      </Field>,
    );

    expect(screen.getByText("necesario para publicar")).toBeDefined();
    expect(screen.getByText("Aparece en el encabezado")).toBeDefined();
    expect(screen.getByRole("alert")).toHaveTextContent("Falta el título.");
  });

  it("renders StatusChip, ProtectedChip, NeedsReviewChip, and Notice", () => {
    render(
      <>
        <StatusChip status="changed" label="Cambios sin publicar" />
        <ProtectedChip label="Protegido" />
        <NeedsReviewChip label="Para revisar" />
        <Notice variant="warning">Modo de prueba</Notice>
      </>,
    );

    expect(screen.getByText("Cambios sin publicar")).toBeDefined();
    expect(screen.getByText("Protegido")).toBeDefined();
    expect(screen.getByText("Para revisar")).toBeDefined();
    expect(screen.getByText("Modo de prueba")).toBeDefined();
  });

  it("switches locales and displays missing English + validation error counts in LocaleTabs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocaleTabs
        activeLocale="es-AR"
        onChange={onChange}
        caption="Idioma del contenido"
        esLabel="Español"
        enLabel="English"
        missingEnCount={2}
        missingEnText="faltan 2"
        errorCounts={{ "es-AR": 1, "en-US": 0 }}
      />,
    );

    expect(screen.getByText("· faltan 2")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    await user.click(screen.getByRole("tab", { name: /English/ }));
    expect(onChange).toHaveBeenCalledWith("en-US");
  });

  it("reorders, removes, and adds items in SortableList without DnD", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onAdd = vi.fn();
    render(
      <SortableList
        items={["Uno", "Dos"]}
        getKey={(x) => x}
        onChange={onChange}
        onAdd={onAdd}
        addLabel="Agregar punto"
        moveUpLabel="Subir"
        moveDownLabel="Bajar"
        removeLabel="Quitar"
        renderItem={(x) => <span>{x}</span>}
      />,
    );

    const downButtons = screen.getAllByRole("button", { name: "Bajar" });
    await user.click(downButtons[0]!);
    expect(onChange).toHaveBeenCalledWith(["Dos", "Uno"]);

    await user.click(screen.getByRole("button", { name: "Agregar punto" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("supports single-choice selection and confirm in PickerDialog", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <PickerDialog
        open
        onOpenChange={() => {}}
        title="Elegir autor"
        closeLabel="Cerrar"
        cancelLabel="Cancelar"
        confirmLabel="Usar"
        items={[
          { id: "a1", name: "Juan" },
          { id: "a2", name: "Ana" },
        ]}
        getKey={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        selectedIds={["a1"]}
        onSelectionChange={onSelectionChange}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ana" }));
    expect(onSelectionChange).toHaveBeenCalledWith(["a2"]);
    await user.click(screen.getByRole("button", { name: "Usar" }));
    expect(onConfirm).toHaveBeenCalledWith(["a1"]);
  });

  it("disables PickerDialog confirm button when confirmDisabled is true even with a selection (ICR-196 AC3)", () => {
    render(
      <PickerDialog
        open
        onOpenChange={() => {}}
        title="Elegir imagen"
        closeLabel="Cerrar"
        cancelLabel="Cancelar"
        confirmLabel="Usar este archivo"
        items={[{ id: "m1", name: "Sin descripción" }]}
        getKey={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        selectedIds={["m1"]}
        onSelectionChange={() => {}}
        confirmDisabled
        onConfirm={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Usar este archivo" }),
    ).toBeDisabled();
  });

  it("locks SlugField when published until the user confirms the warning dialog", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <SlugField
        label="Dirección"
        prefix="blog/"
        value="mi-articulo"
        onChange={onChange}
        isPublished
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(screen.getByText(/los «me gusta» vuelven a cero/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Cambiar dirección" }));
    expect(screen.getByRole("textbox")).toHaveValue("mi-articulo");
  });

  it("renders ConfirmDialog and ErrorSummary links", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onSelectError = vi.fn();
    render(
      <>
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="¿Descartar?"
          closeLabel="Cerrar"
          cancelLabel="Cancelar"
          confirmLabel="Descartar"
          variant="destructive"
          onConfirm={onConfirm}
        />
        <ErrorSummary
          heading="Falta completar 1 cosa:"
          errors={[
            {
              path: "title.es-AR",
              message: "Falta el título (Español).",
              localeTab: "es-AR",
            },
          ]}
          onSelectError={onSelectError}
        />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("opens ActionMenu item callback cleanly after closing dropdown without locking body pointer-events", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ActionMenu
        triggerLabel="Más acciones"
        items={[
          {
            id: "discard",
            label: "Descartar cambios",
            variant: "destructive",
            onSelect,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(screen.getByRole("menuitem", { name: "Descartar cambios" }));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
});
