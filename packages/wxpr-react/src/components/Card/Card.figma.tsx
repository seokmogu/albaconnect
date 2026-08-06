// Code Connect: Figma Card ↔ React @wxpr/react Card.
// Node id 116-151 confirmed from PD template.
import figma from "@figma/code-connect";
import { Card } from "./Card";

figma.connect(
  Card,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=116-151",
  {
    props: {
      variant: figma.enum("Style", {
        Default: "default",
        Outlined: "outlined",
        Raised: "raised",
      }),
      padding: figma.enum("Padding", {
        Small: "small",
        Medium: "medium",
        Large: "large",
      }),
      children: figma.children("*"),
    },
    example: (props) => (
      <Card variant={props.variant} padding={props.padding}>
        {props.children}
      </Card>
    ),
  },
);
