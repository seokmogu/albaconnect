// Code Connect: Figma Input ↔ React @wxpr/react Input.
// Node id 114-99 confirmed from PD template.
import figma from "@figma/code-connect";
import { Input } from "./Input";

figma.connect(
  Input,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=114-99",
  {
    props: {
      size: figma.enum("Size", {
        Small: "small",
        Medium: "medium",
        Large: "large",
      }),
      label: figma.boolean("showLabel", {
        true: figma.string("label"),
        false: undefined,
      }),
      placeholder: figma.string("placeholder"),
      helperText: figma.boolean("showHelperText", {
        true: figma.string("helperText"),
        false: undefined,
      }),
      // "Error" state in Figma maps to a real error string in code.
      errorMessage: figma.enum("State", {
        Default: undefined,
        Focused: undefined,
        Disabled: undefined,
        Error: figma.string("errorMessage"),
      }),
      leadingIcon: figma.boolean("showLeadingIcon", {
        true: figma.instance("leadingIcon"),
        false: undefined,
      }),
      disabled: figma.enum("State", {
        Default: false,
        Focused: false,
        Error: false,
        Disabled: true,
      }),
    },
    example: (props) => (
      <Input
        size={props.size}
        label={props.label}
        placeholder={props.placeholder}
        helperText={props.helperText}
        errorMessage={props.errorMessage}
        leadingIcon={props.leadingIcon as never}
        disabled={props.disabled}
      />
    ),
  },
);
