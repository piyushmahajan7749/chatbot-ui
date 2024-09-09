"use client"

import { useState } from "react"

import { Label } from "@radix-ui/react-label"
import { Box, Container, Flex } from "@radix-ui/themes"
import { Loader } from "../../../../../components/ui/loader"
import { Button } from "../../../../../components/ui/button"

interface DiscoveryProps {
  onSave: () => void
  onCancel: () => void
  colorId: string
}

export function ApproachComponent({
  onCancel,
  onSave,
  colorId
}: DiscoveryProps) {
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
    <Container my="2">
      <Box className="p-1">
        <Flex direction="column">
          {isLoading ? (
            <div className="my-48">
              <Loader text="Generating content" />
            </div>
          ) : (
            <>
              <Flex direction={"column"} className="mr-4 w-full">
                <div
                  className={`bg- flex w-full flex-row items-center justify-start${colorId}bg mb-4 py-4`}
                >
                  <Label
                    style={{ width: 176 }}
                    className="pl-4 text-sm font-bold"
                  >
                    Aim
                  </Label>
                </div>
              </Flex>
              <Flex className="my-1 w-full" justify="center">
                <Button
                  onClick={onCancel}
                  className="my-2 mr-4 w-1/4"
                  color="gray"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  className=" my-2 w-1/4"
                  style={{ backgroundColor: "link" }}
                >
                  Save
                </Button>
              </Flex>
            </>
          )}
        </Flex>
      </Box>
    </Container>
  )
}

export default ApproachComponent
