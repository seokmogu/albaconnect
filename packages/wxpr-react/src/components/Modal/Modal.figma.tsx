// Code Connect: Figma Modal ↔ React @wxpr/react Modal.
// ⚠️ Node id below points to the Modal/Toast/Dropdown page (127-2) — replace
// with the actual Modal component-set node id before running
// `pnpm figma:publish`. Right-click the Modal component in Figma → "Copy link"
// → paste the URL here (the node-id query param is what matters).
import figma from "@figma/code-connect";
import { Modal } from "./Modal";

figma.connect(
  Modal,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=127-2",
  {
    props: {
      title: figma.string("title"),
      description: figma.boolean("showDescription", {
        true: figma.string("description"),
        false: undefined,
      }),
      size: figma.enum("Size", {
        Small: "small",
        Medium: "medium",
        Large: "large",
        "X-Large": "x-large",
      }),
      variant: figma.enum("Type", {
        Default: "default",
        Confirmation: "confirmation",
        Destructive: "destructive",
      }),
      primaryActionLabel: figma.string("primaryActionLabel"),
      cancelLabel: figma.string("cancelLabel"),
      showCancel: figma.boolean("showCancel"),
    },
    example: (props) => (
      <Modal
        open
        onClose={() => {}}
        title={props.title}
        description={props.description}
        size={props.size}
        variant={props.variant}
        primaryActionLabel={props.primaryActionLabel}
        cancelLabel={props.cancelLabel}
        showCancel={props.showCancel}
      />
    ),
  },
);
