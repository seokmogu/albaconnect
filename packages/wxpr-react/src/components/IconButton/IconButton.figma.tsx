// Code Connect: Figma IconButton ↔ React @wxpr/react IconButton.
// Node id 112-131 confirmed from PD template (Worxphere-DS-v1/code-connect).
import figma from "@figma/code-connect";
import { IconButton } from "./IconButton";

figma.connect(
  IconButton,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=112-131",
  {
    props: {
      variant: figma.enum("Style", {
        Primary: "primary",
        Secondary: "secondary",
        Tertiary: "tertiary",
        Ghost: "ghost",
      }),
      size: figma.enum("Size", {
        "X-Small": "x-small",
        Small: "small",
        Medium: "medium",
        Large: "large",
      }),
      icon: figma.instance("icon"),
      disabled: figma.enum("State", {
        Default: false,
        Hover: false,
        Pressed: false,
        Disabled: true,
      }),
    },
    example: (props) => (
      <IconButton
        variant={props.variant}
        size={props.size}
        icon={props.icon as never}
        disabled={props.disabled}
        aria-label="action"
      />
    ),
  },
);
