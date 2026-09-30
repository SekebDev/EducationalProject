'use client';

import { useRef } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  type MotionProps,
  type UseInViewOptions,
  type Variants,
} from 'motion/react';
import { useReducedMotion } from '@/lib/use-reduced-motion';

type MarginType = UseInViewOptions['margin'];

interface BlurFadeProps
  extends Omit<React.ComponentPropsWithoutRef<'div'>, keyof MotionProps>,
    MotionProps {
  children: React.ReactNode;
  className?: string | undefined;
  variant?: {
    hidden: { y: number };
    visible: { y: number };
  };
  duration?: number;
  delay?: number;
  offset?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  inView?: boolean;
  inViewMargin?: MarginType;
  blur?: string;
}

const getFilter = (v: Variants[string] | undefined) =>
  typeof v === 'function' ? undefined : v?.filter;

function fadeVariants(
  direction: BlurFadeProps['direction'],
  offset: number,
  blur: string,
): Variants {
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const distance =
    direction === 'right' || direction === 'down' ? -offset : offset;
  return {
    hidden: { [axis]: distance, opacity: 0, filter: `blur(${blur})` },
    visible: { [axis]: 0, opacity: 1, filter: 'blur(0px)' },
  };
}

function filterTransition(variants: Variants, duration: number) {
  const hidden = getFilter(variants.hidden);
  const visible = getFilter(variants.visible);
  return hidden !== undefined && visible !== undefined && hidden !== visible
    ? { filter: { duration } }
    : {};
}

export function BlurFade({
  children,
  className,
  variant,
  duration = 0.4,
  delay = 0,
  offset = 6,
  direction = 'down',
  inView = false,
  inViewMargin = '-50px',
  blur = '6px',
  ...props
}: BlurFadeProps) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin });
  const isInView = !inView || inViewResult;
  const defaultVariants = fadeVariants(direction, offset, blur);
  const combinedVariants = variant ?? defaultVariants;
  const transitionDuration = reduceMotion ? 0 : duration;

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={reduceMotion ? false : 'hidden'}
        animate={reduceMotion || isInView ? 'visible' : 'hidden'}
        exit="hidden"
        variants={combinedVariants}
        transition={{
          delay: reduceMotion ? 0 : 0.04 + delay,
          duration: transitionDuration,
          ease: 'easeOut',
          ...filterTransition(combinedVariants, transitionDuration),
        }}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
