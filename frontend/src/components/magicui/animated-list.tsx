"use client";

import { motion } from "motion/react";
import { type ReactNode } from "react";

interface AnimatedListItemProps {
  children: ReactNode;
  index?: number;
}

export function AnimatedListItem({ children, index = 0 }: AnimatedListItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 22,
        delay: Math.min(index * 0.01, 0.1),
      }}
    >
      {children}
    </motion.div>
  );
}
