import React, { FC } from "react"

export const Logo: FC = () => {
    return (
        <svg width="50" height="50" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="64" height="64" rx="18" fill="#1a140c" />
            <path d="M16 22h20" stroke="#e4b15a" strokeWidth="4" strokeLinecap="round" />
            <path d="M16 32h32" stroke="#8edfd6" strokeWidth="4" strokeLinecap="round" />
            <path d="M16 42h14" stroke="#f7f2ea" strokeWidth="4" strokeLinecap="round" />
        </svg>
    )
}