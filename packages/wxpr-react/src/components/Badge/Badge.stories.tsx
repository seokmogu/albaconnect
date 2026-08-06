import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  args: { children: "New", variant: "brand", size: "medium" },
  argTypes: {
    variant: {
      control: "select",
      options: ["neutral", "brand", "success", "danger", "warning", "info"],
    },
    size: { control: "select", options: ["small", "medium"] },
  },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {};
export const WithIcon: Story = {
  args: { icon: "check-circle", variant: "success", children: "Verified" },
};
export const Small: Story = { args: { size: "small" } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge variant="neutral">Neutral</Badge>
      <Badge variant="brand" icon="sparkle">Brand</Badge>
      <Badge variant="success" icon="check-circle">Hired</Badge>
      <Badge variant="danger" icon="x-circle">Rejected</Badge>
      <Badge variant="warning" icon="warning">Pending</Badge>
      <Badge variant="info" icon="info">Info</Badge>
    </div>
  ),
};
