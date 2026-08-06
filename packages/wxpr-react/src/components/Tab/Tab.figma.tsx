// Code Connect: Figma TabItem ↔ React @wxpr/react Tab.
// Node id 115-71 confirmed from PD template. TabGroup is composed in code
// (no Figma component for the wrapper); per-tab mapping only.
import figma from "@figma/code-connect";
import { Tab } from "./Tab";

figma.connect(
  Tab,
  "https://www.figma.com/design/10o1NV8As4qmucFytchJYu/Worxphere-Design-System-v1?node-id=115-71",
  {
    props: {
      label: figma.string("label"),
      active: figma.enum("State", {
        Active: true,
        Default: false,
        Hover: false,
      }),
      icon: figma.boolean("showIcon", {
        true: figma.instance("icon"),
        false: undefined,
      }),
    },
    example: (props) => (
      <Tab active={props.active} icon={props.icon as never}>
        {props.label}
      </Tab>
    ),
  },
);
