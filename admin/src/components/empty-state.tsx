import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox aria-hidden="true" size={22} />
      </span>
      <h2 className="empty-title">{title}</h2>
      <p className="empty-description">{description}</p>
      {action}
    </div>
  );
}
