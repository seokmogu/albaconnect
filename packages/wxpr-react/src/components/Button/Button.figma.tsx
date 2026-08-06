// Code Connect mapping: Figma Button (component set) ↔ React @wxpr/react Button.
// Figma file: 10o1NV8As4qmucFytchJYu — node id resolved from PD template
// (Worxphere-DS-v1/code-connect/Button.figma.ts). Update the node-id below if
// the component set is moved or renamed before publishing.
import figma from "@figma/code-connect";
import { Button } from "./Button";

figma.connect(
  Button,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=113-306",
  {
    props: {
      label: figma.string("label"),
      variant: figma.enum("Style", {
        Primary: "primary",
        Secondary: "secondary",
        Tertiary: "tertiary",
        Ghost: "ghost",
        Danger: "danger",
      }),
      size: figma.enum("Size", {
        Small: "small",
        Medium: "medium",
        Large: "large",
      }),
      // Hover / Pressed are CSS-driven in code, so collapse to Default.
      // Only "Disabled" maps to a real prop.
      disabled: figma.enum("State", {
        Default: false,
        Hover: false,
        Pressed: false,
        Disabled: true,
      }),
      leadingIcon: figma.boolean("showLeadingIcon", {
        true: figma.instance("leadingIcon"),
        false: undefined,
      }),
      trailingIcon: figma.boolean("showTrailingIcon", {
        true: figma.instance("trailingIcon"),
        false: undefined,
      }),
    },
    example: (props) => (
      <Button
        variant={props.variant}
        size={props.size}
        disabled={props.disabled}
        leadingIcon={props.leadingIcon as never}
        trailingIcon={props.trailingIcon as never}
      >
        {props.label}
      </Button>
    ),
  },
);
