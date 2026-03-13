import { useState, memo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAutoSave } from "@/hooks/useAutoSave";
import { updateSalaryPart } from "@/lib/db";
import type { SalaryPart } from "@/lib/types";

interface SalaryPartRowProps {
  part: SalaryPart;
  onDelete: (id: number) => void;
  onChanged: () => void;
}

export const SalaryPartRow = memo(function SalaryPartRow({
  part,
  onDelete,
  onChanged,
}: SalaryPartRowProps) {
  const [name, setName] = useState(part.name ?? "");
  const [amount, setAmount] = useState(part.amount ? String(Math.round(part.amount / 100)) : "");
  const [frequency, setFrequency] = useState(String(part.frequency));
  const [isVariable, setIsVariable] = useState(part.is_variable);

  const nameSave = useAutoSave({
    onSave: async (value) => {
      await updateSalaryPart(part.id, "name", value);
      onChanged();
    },
  });

  const amountSave = useAutoSave({
    onSave: async (value) => {
      const cents =
        value === null || value === "" ? "0" : String(Math.round(parseFloat(value) * 100));
      await updateSalaryPart(part.id, "amount", cents);
      onChanged();
    },
  });

  const freqSave = useAutoSave({
    onSave: async (value) => {
      await updateSalaryPart(part.id, "frequency", value === null || value === "" ? "1" : value);
      onChanged();
    },
  });

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-2 py-1">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            nameSave.save(e.target.value || null);
          }}
          placeholder="Label"
          className="h-8 text-sm"
        />
      </td>
      <td className="px-2 py-1">
        <div className="relative flex items-center">
          <span className="absolute left-2 text-xs text-muted-foreground">$</span>
          <Input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              amountSave.save(e.target.value || null);
            }}
            className="h-8 pl-5 text-sm w-28"
          />
        </div>
      </td>
      <td className="px-2 py-1">
        <Input
          type="number"
          min="1"
          value={frequency}
          onChange={(e) => {
            setFrequency(e.target.value);
            freqSave.save(e.target.value || null);
          }}
          className="h-8 text-sm w-16"
        />
      </td>
      <td className="px-2 py-1 text-center">
        <Checkbox
          checked={isVariable}
          onCheckedChange={async (checked) => {
            const val = !!checked;
            setIsVariable(val);
            await updateSalaryPart(part.id, "is_variable", val ? "1" : "0");
            onChanged();
          }}
        />
      </td>
      <td className="px-2 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
          onClick={() => onDelete(part.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
});
