import type { Meta, StoryObj } from "@storybook/react";
import { Toast } from "./Toast";

const meta: Meta<typeof Toast> = {
  title: "Components/Toast",
  component: Toast,
  args: { message: "Saved your changes.", type: "info", duration: 0 },
  argTypes: {
    type: { control: "select", options: ["info", "success", "warning", "danger"] },
    position: { control: "select", options: ["top", "bottom"] },
  },
};
export default meta;
type Story = StoryObj<typeof Toast>;

export const Info: Story = {};
export const Success: Story = {
  args: { type: "success", message: "Candidate moved to Interview stage." },
};
export const Warning: Story = {
  args: { type: "warning", message: "Heads up — 2 interviews still need a slot." },
};
export const Danger: Story = {
  args: { type: "danger", message: "Failed to sync with calendar. Please retry." },
};
export const WithAction: Story = {
  args: {
    type: "success",
    message: "Offer sent to Sang-min Lee.",
    actionLabel: "View",
    onAction: () => alert("View offer"),
  },
};
export const WithClose: Story = {
  args: {
    type: "info",
    message: "Closeable toast (5s auto-dismiss disabled).",
    duration: 0,
    onClose: () => alert("closed"),
  },
};
