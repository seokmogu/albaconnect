import type { Meta, StoryObj } from "@storybook/react";
import { IconButton } from "./IconButton";

const meta: Meta<typeof IconButton> = {
  title: "Components/IconButton",
  component: IconButton,
  args: { icon: "magnifying-glass", "aria-label": "Search" },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "tertiary", "ghost"],
    },
    size: { control: "select", options: ["x-small", "small", "medium", "large"] },
  },
};
export default meta;
type Story = StoryObj<typeof IconButton>;

export const Default: Story = {};
export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Tertiary: Story = { args: { variant: "tertiary" } };
export const Disabled: Story = { args: { disabled: true } };

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <IconButton size="x-small" icon="gear" variant="secondary" aria-label="Settings (xs)" />
      <IconButton size="small" icon="gear" variant="secondary" aria-label="Settings (s)" />
      <IconButton size="medium" icon="gear" variant="secondary" aria-label="Settings (m)" />
      <IconButton size="large" icon="gear" variant="secondary" aria-label="Settings (l)" />
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <IconButton variant="primary" icon="paper-plane-tilt" aria-label="Send" />
      <IconButton variant="secondary" icon="paper-plane-tilt" aria-label="Send" />
      <IconButton variant="tertiary" icon="paper-plane-tilt" aria-label="Send" />
      <IconButton variant="ghost" icon="paper-plane-tilt" aria-label="Send" />
    </div>
  ),
};
