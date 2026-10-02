import type { Person } from "../../models";
import { Icon } from "../ui/Icon";

export function Portrait({
  person,
  big = false,
}: {
  person: Person;
  big?: boolean;
}) {
  return (
    <div className={`portrait ${person.tone} ${big ? "big" : ""}`}>
      <Icon name="UserRound" />
      <span>{person.name.slice(-1)}</span>
    </div>
  );
}
