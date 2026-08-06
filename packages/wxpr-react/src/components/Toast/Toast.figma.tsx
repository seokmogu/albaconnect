// Code Connect: Figma Toast ↔ React @wxpr/react Toast.
// ⚠️ Node id below points to the Modal/Toast/Dropdown page (127-2) — replace
// with the actual Toast component-set node id before `pnpm figma:publish`.
import figma from "@figma/code-connect";
import { Toast } from "./Toast";

figma.connect(
  Toast,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=127-2",
  {
    props: {
      message: figma.string("message"),
      type: figma.enum("Type", {
        Info: "info",
        Success: "success",
        Warning: "warning",
        Danger: "danger",
      }),
      position: figma.enum("Position", {
        Top: "top",
        Bottom: "bottom",
      }),
      actionLabel: figma.boolean("showAction", {
        true: figma.string("actionLabel"),
        false: undefined,
      }),
    },
    example: (props) => (
      <Toast
        message={props.message}
        type={props.type}
        position={props.position}
        actionLabel={props.actionLabel}
      />
    ),
  },
);
