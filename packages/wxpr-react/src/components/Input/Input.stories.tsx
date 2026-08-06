import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
  args: {
    placeholder: "Search candidates…",
    label: "Search",
    size: "medium",
  },
  argTypes: {
    size: { control: "select", options: ["small", "medium", "large"] },
  },
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};
export const WithLeadingIcon: Story = {
  args: { leadingIcon: "magnifying-glass" },
};
export const WithHelperText: Story = {
  args: { helperText: "We'll never share this." },
};
export const WithError: Story = {
  args: {
    label: "Email",
    placeholder: "you@worxphere.ai",
    errorMessage: "Email is required.",
    leadingIcon: "envelope",
  },
};
export const Disabled: Story = {
  args: { disabled: true, value: "you@worxphere.ai" },
};
export const FullWidth: Story = {
  args: { fullWidth: true, placeholder: "Long-form search…" },
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 360 }}>
      <Input size="small" label="Small" placeholder="Small" leadingIcon="user" />
      <Input size="medium" label="Medium" placeholder="Medium" leadingIcon="user" />
      <Input size="large" label="Large" placeholder="Large" leadingIcon="user" />
    </div>
  ),
};
