"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLinks } from "@/components/layout/nav-links";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <button
          aria-label="打开导航"
          className="icon-button ghost mobile-menu"
          type="button"
        >
          <Menu size={19} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            background: "rgba(0,0,0,.45)",
            inset: 0,
            position: "fixed",
            zIndex: 69,
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onClick={(event) => {
            if ((event.target as Element).closest("a")) setOpen(false);
          }}
          style={{
            background: "var(--surface)",
            bottom: 0,
            left: 0,
            position: "fixed",
            top: 0,
            width: 260,
            zIndex: 70,
          }}
        >
          <div className="brand">
            <span className="brand-mark">LP</span>
            <Dialog.Title style={{ fontSize: 15 }}>
              Blog Admin
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="关闭导航"
                className="icon-button ghost"
                style={{ marginLeft: "auto" }}
                type="button"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <NavLinks />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
