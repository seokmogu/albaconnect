// Code Connect: Figma Dropdown ↔ React @wxpr/react Dropdown.
// ⚠️ Node id below points to the Modal/Toast/Dropdown page (127-2) — replace
// with the actual Dropdown component-set node id before `pnpm figma:publish`.
// `DropdownItem` is composed in code; mapping covers the trigger only.
import figma from "@figma/code-connect";
import { Dropdown } from "./Dropdown";

figma.connect(
  Dropdown,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=127-2",
  {
    props: {
      placeholder: figma.string("placeholder"),
      size: figma.enum("Size", {
        Small: "small",
        Medium: "medium",
        Large: "large",
      }),
      disabled: figma.enum("State", {
        Default: false,
        Hover: false,
        Open: false,
        Disabled: true,
      }),
    },
    example: (props) => (
      <Dropdown
        placeholder={props.placeholder}
        size={props.size}
        disabled={props.disabled}
      >
        {/* DropdownItem children are populated at runtime */}
      </Dropdown>
    ),
  },
);
