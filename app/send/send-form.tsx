"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { sendDocument } from "./actions"

const PLACEHOLDER = `{
  "replace": "with the JSON your outbound mapping reads"
}`

export function SendForm({
  partnerKeys,
  tsCodes,
}: {
  partnerKeys: string[]
  tsCodes: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await sendDocument(formData)
      if (result.status === "success") toast.success(result.message)
      else toast.error(result.message)
      if (result.submissionId) {
        router.push(`/submissions/${result.submissionId}`)
      }
    })
  }

  return (
    <form action={onSubmit} className="grid gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="partner">Partner key</Label>
          <Input
            id="partner"
            name="partner"
            list="partner-keys"
            autoComplete="off"
            required
          />
          <datalist id="partner-keys">
            {partnerKeys.map((key) => (
              <option key={key} value={key} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tsCode">Transaction set</Label>
          <Input
            id="tsCode"
            name="tsCode"
            list="ts-codes"
            inputMode="numeric"
            autoComplete="off"
            required
          />
          <datalist id="ts-codes">
            {tsCodes.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contents">Document (JSON object)</Label>
        <Textarea
          id="contents"
          name="contents"
          rows={16}
          placeholder={PLACEHOLDER}
          className="font-mono"
          required
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="test" defaultChecked />
        Send as a test interchange (ISA15 = T)
      </label>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending..." : "Send"}
        </Button>
      </div>
    </form>
  )
}
