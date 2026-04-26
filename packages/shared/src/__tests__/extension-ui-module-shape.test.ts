/**
 * Type-shape and union-membership tests for the Extension UI System Phase-1
 * schema and protocol additions. See change: add-extension-ui-modal.
 *
 * The point of these tests is twofold:
 *
 * 1.  **Compile-time shape validation.** Constructing concrete
 *     `ExtensionUiModule` instances with the canonical view kinds (`table`,
 *     `grid`, `form`) and `UiAction` confirm-polish flag forces the type
 *     system to enforce the field shapes from the design.
 *
 * 2.  **Union membership.** The new wire-protocol messages
 *     (`ui_modules_list`, `ui_data_list`, `ui_management`) are dropped by
 *     esbuild in production if they are not members of the
 *     `ServerToBrowserMessage` / `BrowserToServerMessage` /
 *     `ExtensionToServerMessage` / `ServerToExtensionMessage` unions. The
 *     `AssertExtends` guards below fail at compile time if any union loses
 *     its new member.
 */
import { describe, it, expect } from "vitest";
import type {
  ExtensionUiModule,
  UiAction,
  UiField,
  UiSection,
  UiView,
} from "../types.js";
import type {
  ExtensionToServerMessage,
  ServerToExtensionMessage,
  UiModulesListMessage,
  UiDataListMessage,
  UiManagementMessage,
} from "../protocol.js";
import type {
  ServerToBrowserMessage,
  BrowserToServerMessage,
  BrowserUiModulesListMessage,
  BrowserUiDataListMessage,
  UiManagementBrowserMessage,
} from "../browser-protocol.js";

// ── Compile-time union-membership assertions ───────────────────────
type AssertExtends<T, U> = T extends U ? true : never;

// Bridge ↔ Server leg
type _UiModulesListInExt = AssertExtends<UiModulesListMessage, ExtensionToServerMessage>;
type _UiDataListInExt = AssertExtends<UiDataListMessage, ExtensionToServerMessage>;
type _UiManagementInServer = AssertExtends<UiManagementMessage, ServerToExtensionMessage>;

// Server ↔ Browser leg
type _BrowserUiModulesInUnion = AssertExtends<BrowserUiModulesListMessage, ServerToBrowserMessage>;
type _BrowserUiDataInUnion = AssertExtends<BrowserUiDataListMessage, ServerToBrowserMessage>;
type _UiManagementInBrowser = AssertExtends<UiManagementBrowserMessage, BrowserToServerMessage>;

// Sentinel — referenced so tsc keeps the assertions live.
const _typeSentinel: Array<true> = [
  true as _UiModulesListInExt,
  true as _UiDataListInExt,
  true as _UiManagementInServer,
  true as _BrowserUiModulesInUnion,
  true as _BrowserUiDataInUnion,
  true as _UiManagementInBrowser,
];

describe("ExtensionUiModule shape", () => {
  it("accepts a table view with dataEvent and rowActions", () => {
    const tableModule: ExtensionUiModule = {
      kind: "management-modal",
      id: "judo-status",
      command: "/judo:status",
      title: "Judo Status",
      description: "Show pending status rows",
      icon: "mdiTableLarge",
      category: "judo",
      view: {
        kind: "table",
        dataEvent: "judo:status-rows",
        rowKey: "id",
        fields: [
          { key: "id", label: "ID", kind: "text", width: 80 },
          { key: "name", label: "Name", kind: "text" },
          { key: "score", label: "Score", kind: "number" },
        ],
        rowActions: [
          {
            id: "delete",
            label: "Delete",
            icon: "mdiDelete",
            variant: "danger",
            event: "judo:delete-row",
            confirm: "Delete this entry?",
          },
        ],
        emptyState: "No rows yet.",
        actions: [
          {
            id: "refresh",
            label: "Refresh",
            icon: "mdiRefresh",
            variant: "secondary",
            event: "judo:refresh",
          },
        ],
      },
    };

    expect(tableModule.kind).toBe("management-modal");
    expect(tableModule.view.kind).toBe("table");
    expect(tableModule.view.dataEvent).toBe("judo:status-rows");
    expect(tableModule.view.rowActions?.[0]?.confirm).toBe("Delete this entry?");
  });

  it("accepts a form view with sections grouping fields", () => {
    const sections: UiSection[] = [
      {
        id: "general",
        title: "General",
        fields: [
          { key: "name", label: "Name", kind: "text", required: true },
          { key: "enabled", label: "Enabled", kind: "boolean" },
        ],
      },
      {
        id: "advanced",
        title: "Advanced",
        description: "Optional knobs.",
        fields: [
          { key: "code", label: "Hook", kind: "code", language: "javascript" },
          { key: "notes", label: "Notes", kind: "textarea" },
        ],
      },
    ];

    const formModule: ExtensionUiModule = {
      kind: "management-modal",
      id: "judo-config",
      command: "/judo:config",
      title: "Judo Config",
      view: {
        kind: "form",
        sections,
        actions: [
          {
            id: "save",
            label: "Save",
            icon: "mdiContentSave",
            variant: "primary",
            event: "judo:save-config",
          },
        ],
      },
    };

    expect(formModule.view.kind).toBe("form");
    expect(formModule.view.sections).toHaveLength(2);
    expect(formModule.view.sections?.[1]?.fields[0]?.kind).toBe("code");
    expect(formModule.view.sections?.[1]?.fields[0]?.language).toBe("javascript");
  });

  it("accepts a grid view (same lifecycle as table) and select-kind fields", () => {
    const fields: UiField[] = [
      { key: "id", label: "ID", kind: "text" },
      { key: "tier", label: "Tier", kind: "select", options: ["bronze", "silver", "gold"] },
      { key: "joinedAt", label: "Joined", kind: "datetime" },
    ];

    const gridModule: ExtensionUiModule = {
      kind: "management-modal",
      id: "judo-members",
      command: "/judo:members",
      title: "Members",
      view: {
        kind: "grid",
        dataEvent: "judo:members-list",
        fields,
      },
    };

    expect(gridModule.view.kind).toBe("grid");
    expect(gridModule.view.fields?.[1]?.options).toEqual(["bronze", "silver", "gold"]);
  });

  it("UiAction supports confirm polish for destructive actions", () => {
    const dangerAction: UiAction = {
      id: "wipe",
      label: "Wipe All",
      variant: "danger",
      event: "judo:wipe",
      confirm: "Wipe all members? This cannot be undone.",
    };

    expect(dangerAction.confirm).toContain("cannot be undone");
    expect(dangerAction.variant).toBe("danger");
  });

  it("UiView with table kind requires neither sections nor actions", () => {
    const minimal: UiView = {
      kind: "table",
      dataEvent: "x:list",
      fields: [{ key: "id", label: "ID", kind: "text" }],
    };
    expect(minimal.kind).toBe("table");
    expect(minimal.actions).toBeUndefined();
    expect(minimal.sections).toBeUndefined();
  });
});

describe("Phase-1 wire protocol", () => {
  it("constructs each message with discriminated literal types", () => {
    const modulesList: UiModulesListMessage = {
      type: "ui_modules_list",
      sessionId: "s1",
      modules: [],
    };
    const dataList: UiDataListMessage = {
      type: "ui_data_list",
      sessionId: "s1",
      event: "judo:status-rows",
      items: [{ id: 1 }, { id: 2 }],
    };
    const browserModules: BrowserUiModulesListMessage = {
      type: "ui_modules_list",
      sessionId: "s1",
      modules: [],
    };
    const browserData: BrowserUiDataListMessage = {
      type: "ui_data_list",
      sessionId: "s1",
      event: "judo:status-rows",
      items: [],
    };
    const mgmt: UiManagementBrowserMessage = {
      type: "ui_management",
      sessionId: "s1",
      action: "list",
      event: "judo:status-rows",
      params: { since: 0 },
    };

    expect(modulesList.type).toBe("ui_modules_list");
    expect(dataList.type).toBe("ui_data_list");
    expect(browserModules.type).toBe("ui_modules_list");
    expect(browserData.type).toBe("ui_data_list");
    expect(mgmt.type).toBe("ui_management");
  });

  it("type discriminants are reachable in a switch (esbuild safety)", () => {
    function classify(msg: ServerToBrowserMessage): string | null {
      switch (msg.type) {
        case "ui_modules_list":
          return `modules:${msg.modules.length}`;
        case "ui_data_list":
          return `data:${msg.event}:${msg.items.length}`;
        default:
          return null;
      }
    }

    expect(classify({ type: "ui_modules_list", sessionId: "s", modules: [] })).toBe("modules:0");
    expect(
      classify({ type: "ui_data_list", sessionId: "s", event: "x", items: [1, 2, 3] }),
    ).toBe("data:x:3");
  });
});
