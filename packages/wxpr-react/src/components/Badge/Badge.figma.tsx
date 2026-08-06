// Code Connect: Figma Badge ↔ React @wxpr/react Badge.
// Node id 116-123 confirmed from PD template.
import figma from "@figma/code-connect";
import { Badge } from "./Badge";

figma.connect(
  Badge,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=116-123",
  {
    props: {
      label: figma.string("label"),
      size: figma.enum("Size", {
        Small: "small",
        Medium: "medium",
      }),
      variant: figma.enum("Style", {
        Neutral: "neutral",
        Brand: "brand",
        Success: "success",
        Danger: "danger",
        Warning: "warning",
        Info: "info",
      }),
      icon: figma.boolean("hasIcon", {
        true: figma.instance("icon"),
        false: undefined,
      }),
    },
    example: (props) => (
      <Badge
        size={props.size}
        variant={props.variant}
        icon={props.icon as never}
      >
        {props.label}
      </Badge>
    ),
  },
);
