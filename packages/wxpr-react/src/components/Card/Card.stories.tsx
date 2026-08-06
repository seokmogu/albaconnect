import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  args: { padding: "medium", variant: "default" },
  argTypes: {
    padding: { control: "select", options: ["small", "medium", "large"] },
    variant: { control: "select", options: ["default", "outlined", "raised"] },
  },
};
export default meta;
type Story = StoryObj<typeof Card>;

const Sample = () => (
  <>
    <h3 style={{ margin: 0, marginBottom: 8 }}>Career snapshot</h3>
    <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
      3 active opportunities · last update 2h ago
    </p>
  </>
);

export const Default: Story = { args: { children: <Sample /> } };
export const Outlined: Story = {
  args: { variant: "outlined", children: <Sample /> },
};
export const Raised: Story = {
  args: { variant: "raised", children: <Sample /> },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      <Card variant="default">
        <strong>Default</strong>
        <p style={{ color: "var(--color-text-secondary)", margin: "4px 0 0" }}>Subtle border</p>
      </Card>
      <Card variant="outlined">
        <strong>Outlined</strong>
        <p style={{ color: "var(--color-text-secondary)", margin: "4px 0 0" }}>Stronger border</p>
      </Card>
      <Card variant="raised">
        <strong>Raised</strong>
        <p style={{ color: "var(--color-text-secondary)", margin: "4px 0 0" }}>With shadow</p>
      </Card>
    </div>
  ),
};
