"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { cx } from "@/lib/utils"

interface ThemeTogglerProps extends React.ComponentPropsWithoutRef<"button"> {}

export const ThemeToggler = ({
  className,
  ...props
}: ThemeTogglerProps) => {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"))
    }

    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])

  const toggleTheme = () => {
    const newTheme = !isDark
    setIsDark(newTheme)
    document.documentElement.classList.toggle("dark")
    localStorage.setItem("theme", newTheme ? "dark" : "light")
  }

  return (
    <button
      onClick={toggleTheme}
      className={cx(className)}
      {...props}
    >
      {isDark ? <Sun /> : <Moon />}
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
