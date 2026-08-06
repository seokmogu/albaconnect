import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Dropdown, DropdownItem } from "./Dropdown";

const meta: Meta<typeof Dropdown> = {
  title: "Components/Dropdown",
  component: Dropdown,
};
export default meta;
type Story = StoryObj<typeof Dropdown>;

export const Basic: Story = {
  render: () => {
    const [val, setVal] = useState<string | undefined>(undefined);
    return (
      <Dropdown
        placeholder="Select a candidate…"
        value={val}
        onValueChange={setVal}
      >
        <DropdownItem value="a" icon="user">Sang-min Lee</DropdownItem>
        <DropdownItem value="b" icon="user">Jihye Park</DropdownItem>
        <DropdownItem value="c" icon="user">David Kim</DropdownItem>
        <DropdownItem value="d" icon="user" disabled>Pending invite</DropdownItem>
      </Dropdown>
    );
  },
};

export const WithIcons: Story = {
  render: () => {
    const [val, setVal] = useState<string>("team");
    return (
      <Dropdown value={val} onValueChange={setVal}>
        <DropdownItem value="me" icon="user">Just me</DropdownItem>
        <DropdownItem value="team" icon="users">My team</DropdownItem>
        <DropdownItem value="org" icon="buildings">Entire org</DropdownItem>
      </Dropdown>
    );
  },
};

export const Sizes: Story = {
  render: () => {
    const [a, setA] = useState<string>();
    const [b, setB] = useState<string>();
    const [c, setC] = useState<string>();
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Dropdown size="small" value={a} onValueChange={setA} placeholder="Small">
          <DropdownItem value="x">X</DropdownItem>
          <DropdownItem value="y">Y</DropdownItem>
        </Dropdown>
        <Dropdown size="medium" value={b} onValueChange={setB} placeholder="Medium">
          <DropdownItem value="x">X</DropdownItem>
          <DropdownItem value="y">Y</DropdownItem>
        </Dropdown>
        <Dropdown size="large" value={c} onValueChange={setC} placeholder="Large">
          <DropdownItem value="x">X</DropdownItem>
          <DropdownItem value="y">Y</DropdownItem>
        </Dropdown>
      </div>
    );
  },
};
