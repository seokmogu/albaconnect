import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Modal } from "./Modal";
import { Button } from "../Button";

const meta: Meta<typeof Modal> = {
  title: "Components/Modal",
  component: Modal,
};
export default meta;
type Story = StoryObj<typeof Modal>;

const Demo = ({
  variant,
  primary,
  destructive,
}: {
  variant?: "default" | "confirmation" | "destructive";
  primary?: string;
  destructive?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={destructive ? "Delete candidate?" : "Confirm action"}
        description={
          destructive
            ? "This will permanently remove the candidate from the pipeline. This action cannot be undone."
            : "We'll save your changes and notify the team."
        }
        variant={variant}
        primaryActionLabel={primary}
        onPrimaryAction={() => setOpen(false)}
      />
    </>
  );
};

export const Default: Story = {
  render: () => <Demo variant="default" primary="Save changes" />,
};
export const Confirmation: Story = {
  render: () => <Demo variant="confirmation" primary="Confirm" />,
};
export const Destructive: Story = {
  render: () => <Demo variant="destructive" primary="Delete" destructive />,
};

export const LargeWithBody: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open large modal</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          size="large"
          title="Update candidate profile"
          description="Edit the candidate's basic info and skills."
          primaryActionLabel="Save"
          onPrimaryAction={() => setOpen(false)}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <p>Body content goes here.</p>
            <p style={{ color: "var(--color-text-secondary)" }}>
              You can place forms, tables, or anything else inside the modal body.
            </p>
          </div>
        </Modal>
      </>
    );
  },
};
