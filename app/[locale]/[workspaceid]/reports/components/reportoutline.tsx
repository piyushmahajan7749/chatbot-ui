"use client"

import { useState } from "react"

import { Label } from "@radix-ui/react-label"
import { Loader } from "../../../../../components/ui/loader"
import { Button } from "../../../../../components/ui/button"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

interface ReportOutlineProps {
  onSave: () => void
  onCancel: () => void
  colorId: string
}

export function ReportOutlineComponent({
  onCancel,
  onSave,
  colorId
}: ReportOutlineProps) {
  const [isLoading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)

    const listOptions = []

    try {
      const data = {
        data: {
          //   habitBeatList: listOptions
        }
      }
      //   updateProject(data)
      onSave()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex w-full flex-col items-center  justify-center">
      {isLoading ? (
        <div className="my-48">
          <Loader text="Generating content" />
        </div>
      ) : (
        <>
          <div className="flex w-full flex-col">
            <div
              className={`mb-4 flex w-full flex-row items-center justify-center rounded-t-lg bg-zinc-700 py-3`}
            >
              <Label className="pl-4 text-lg font-bold">Aim</Label>
            </div>
          </div>
          <div className="mb-80 flex w-full flex-col justify-center"></div>
          <div className="flex w-full flex-row justify-center">
            <Button onClick={onCancel} className="my-2 mr-4 w-1/6" color="gray">
              <ArrowLeftIcon className="mr-2 size-4" />
              Previous
            </Button>
            <Button
              onClick={handleSave}
              className=" my-2 w-1/6"
              style={{ backgroundColor: "link" }}
            >
              Next
              <ArrowRightIcon className="ml-2 size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export default ReportOutlineComponent
