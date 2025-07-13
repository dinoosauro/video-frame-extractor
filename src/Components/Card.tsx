import type { ReactNode } from "react"

interface Props {
    /**
     * The content inside the card
     */
    children: ReactNode,
    /**
     * If the card should be inside another card. This means a lighter color in dark mode and a darker color in light mode.
     */
    secondLevel?: boolean
}
/**
 * A div with a different color, to differentiate the content in it
 * @returns the Card ReactNode
 */
export default function Card({children, secondLevel}: Props) {
    return <div className="card" style={{backgroundColor: secondLevel ? "var(--secondcard)" : undefined}}>
        {children}
    </div>
}