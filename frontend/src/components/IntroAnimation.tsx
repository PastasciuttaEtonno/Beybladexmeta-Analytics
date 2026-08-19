import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeProvider";

interface IntroAnimationProps {
    onComplete: () => void;
}

export function IntroAnimation({ onComplete }: IntroAnimationProps) {
    const [isVisible, setIsVisible] = useState(true);
    const { theme } = useTheme();

    useEffect(() => {
        // Start exit animation after 2.8 seconds
        const timer = setTimeout(() => {
            setIsVisible(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    const logoSrc = theme === 'dark' ? '/meta logoWhite.svg' : '/meta logo.png';

    return (
        <AnimatePresence onExitComplete={onComplete}>
            {isVisible && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                >
                    <div className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center">
                        {/* Base Logo with subtle scale animation */}
                        <motion.img
                            src={logoSrc}
                            alt="Loading..."
                            className="w-full h-full object-contain relative z-10"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                                duration: 0.6,
                                ease: [0.34, 1.56, 0.64, 1] // Smooth bounce
                            }}
                        />

                        {/* Ambient base glow - subtle metallic foundation */}
                        <motion.div
                            className="absolute inset-0 w-full h-full"
                            style={{
                                maskImage: `url("${logoSrc}")`,
                                WebkitMaskImage: `url("${logoSrc}")`,
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                            }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.15 }}
                            transition={{ duration: 0.8 }}
                        >
                            <div
                                className="w-full h-full"
                                style={{
                                    background: theme === 'dark'
                                        ? "radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.3) 0%, transparent 70%)"
                                        : "radial-gradient(circle at 50% 50%, rgba(200, 200, 220, 0.3) 0%, transparent 70%)"
                                }}
                            />
                        </motion.div>

                        {/* Primary metallic sweep - main shimmer effect */}
                        <div
                            className="absolute inset-0 w-full h-full overflow-hidden"
                            style={{
                                maskImage: `url("${logoSrc}")`,
                                WebkitMaskImage: `url("${logoSrc}")`,
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                            }}
                        >
                            <motion.div
                                className="absolute inset-y-0 h-full"
                                style={{
                                    width: "300%",
                                    left: "-100%",
                                    background: theme === 'dark'
                                        ? `linear-gradient(
                                            110deg,
                                            transparent 0%,
                                            transparent 35%,
                                            rgba(255, 255, 255, 0.03) 40%,
                                            rgba(255, 255, 255, 0.08) 45%,
                                            rgba(255, 255, 255, 0.25) 48%,
                                            rgba(255, 255, 255, 0.5) 50%,
                                            rgba(255, 255, 255, 0.25) 52%,
                                            rgba(255, 255, 255, 0.08) 55%,
                                            rgba(255, 255, 255, 0.03) 60%,
                                            transparent 65%,
                                            transparent 100%
                                        )`
                                        : `linear-gradient(
                                            110deg,
                                            transparent 0%,
                                            transparent 35%,
                                            rgba(255, 255, 255, 0.1) 40%,
                                            rgba(255, 255, 255, 0.2) 45%,
                                            rgba(255, 255, 255, 0.4) 48%,
                                            rgba(255, 255, 255, 0.7) 50%,
                                            rgba(255, 255, 255, 0.4) 52%,
                                            rgba(255, 255, 255, 0.2) 55%,
                                            rgba(255, 255, 255, 0.1) 60%,
                                            transparent 65%,
                                            transparent 100%
                                        )`,
                                    willChange: "transform",
                                }}
                                animate={{
                                    x: ["0%", "100%"]
                                }}
                                transition={{
                                    duration: 2,
                                    ease: [0.25, 0.1, 0.25, 1], // Smooth cubic-bezier
                                    repeat: Infinity,
                                    repeatDelay: 0.2
                                }}
                            />
                        </div>

                        {/* Secondary shimmer - adds depth with offset timing */}
                        <div
                            className="absolute inset-0 w-full h-full overflow-hidden"
                            style={{
                                maskImage: `url("${logoSrc}")`,
                                WebkitMaskImage: `url("${logoSrc}")`,
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                            }}
                        >
                            <motion.div
                                className="absolute inset-y-0 h-full"
                                style={{
                                    width: "250%",
                                    left: "-75%",
                                    background: theme === 'dark'
                                        ? `linear-gradient(
                                            100deg,
                                            transparent 0%,
                                            transparent 42%,
                                            rgba(200, 220, 255, 0.08) 48%,
                                            rgba(200, 220, 255, 0.15) 50%,
                                            rgba(200, 220, 255, 0.08) 52%,
                                            transparent 58%,
                                            transparent 100%
                                        )`
                                        : `linear-gradient(
                                            100deg,
                                            transparent 0%,
                                            transparent 42%,
                                            rgba(180, 200, 255, 0.15) 48%,
                                            rgba(180, 200, 255, 0.25) 50%,
                                            rgba(180, 200, 255, 0.15) 52%,
                                            transparent 58%,
                                            transparent 100%
                                        )`,
                                    willChange: "transform",
                                }}
                                animate={{
                                    x: ["0%", "100%"]
                                }}
                                transition={{
                                    duration: 2.3,
                                    ease: [0.25, 0.1, 0.25, 1],
                                    repeat: Infinity,
                                    repeatDelay: 0.2,
                                    delay: 0.3 // Offset from primary shimmer
                                }}
                            />
                        </div>

                        {/* Specular highlight - sharp light catch effect */}
                        <div
                            className="absolute inset-0 w-full h-full overflow-hidden"
                            style={{
                                maskImage: `url("${logoSrc}")`,
                                WebkitMaskImage: `url("${logoSrc}")`,
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                            }}
                        >
                            <motion.div
                                className="absolute inset-y-0 h-full"
                                style={{
                                    width: "200%",
                                    left: "-50%",
                                    background: `linear-gradient(
                                        115deg,
                                        transparent 0%,
                                        transparent 47%,
                                        rgba(255, 255, 255, 0.9) 49.5%,
                                        rgba(255, 255, 255, 1) 50%,
                                        rgba(255, 255, 255, 0.9) 50.5%,
                                        transparent 53%,
                                        transparent 100%
                                    )`,
                                    willChange: "transform",
                                }}
                                animate={{
                                    x: ["0%", "100%"]
                                }}
                                transition={{
                                    duration: 2,
                                    ease: [0.25, 0.1, 0.25, 1],
                                    repeat: Infinity,
                                    repeatDelay: 0.2
                                }}
                            />
                        </div>

                        {/* Soft pulsing glow - adds life and breathing effect */}
                        <motion.div
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{
                                maskImage: `url("${logoSrc}")`,
                                WebkitMaskImage: `url("${logoSrc}")`,
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                                filter: "blur(12px)",
                            }}
                            animate={{
                                opacity: [0, 0.2, 0.4, 0.2, 0]
                            }}
                            transition={{
                                duration: 3,
                                ease: "easeInOut",
                                repeat: Infinity,
                            }}
                        >
                            <div
                                className="w-full h-full"
                                style={{
                                    background: theme === 'dark'
                                        ? "radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, transparent 60%)"
                                        : "radial-gradient(circle, rgba(200, 220, 255, 0.6) 0%, transparent 60%)"
                                }}
                            />
                        </motion.div>

                        {/* Edge highlights - simulates light catching edges */}
                        <motion.div
                            className="absolute inset-0 w-full h-full"
                            style={{
                                maskImage: `url("${logoSrc}")`,
                                WebkitMaskImage: `url("${logoSrc}")`,
                                maskSize: "contain",
                                WebkitMaskSize: "contain",
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                maskPosition: "center",
                                WebkitMaskPosition: "center",
                                filter: "blur(1px)",
                            }}
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: [0, 0.3, 0.5, 0.3, 0]
                            }}
                            transition={{
                                duration: 2.5,
                                ease: "easeInOut",
                                repeat: Infinity,
                                delay: 0.5
                            }}
                        >
                            <div
                                className="w-full h-full"
                                style={{
                                    background: theme === 'dark'
                                        ? "linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, transparent 30%, transparent 70%, rgba(255, 255, 255, 0.3) 100%)"
                                        : "linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, transparent 30%, transparent 70%, rgba(200, 220, 255, 0.4) 100%)"
                                }}
                            />
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}