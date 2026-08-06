import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Tab, TabGroup } from "./Tab";

const meta: Meta<typeof TabGroup> = {
  title: "Components/Tab",
  component: TabGroup,
};
export default meta;
type Story = StoryObj<typeof TabGroup>;

export const Basic: Story = {
  render: () => {
    const [tab, setTab] = useState("overview");
    return (
      <TabGroup value={tab} onValueChange={setTab}>
        <Tab value="overview" icon="house">Overview</Tab>
        <Tab value="candidates" icon="users">Candidates</Tab>
        <Tab value="schedule" icon="calendar">Schedule</Tab>
        <Tab value="settings" icon="gear">Settings</Tab>
      </TabGroup>
    );
  },
};

export const NoIcons: Story = {
  render: () => {
    const [tab, setTab] = useState("a");
    return (
      <TabGroup value={tab} onValueChange={setTab}>
        <Tab value="a">Overview</Tab>
        <Tab value="b">Activity</Tab>
        <Tab value="c">Settings</Tab>
      </TabGroup>
    );
  },
};
