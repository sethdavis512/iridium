import { Container } from './Container';

export function Footer() {
    return (
        <footer className="py-4 bg-base-200 text-sm">
            <Container className="px-4">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4 md:grid-cols-4 md:gap-3">
                    <div>
                        <h3 className="font-semibold mb-1">About</h3>
                        <ul className="flex flex-col gap-1">
                            <li>
                                <a href="https://sethdavis.tech/iridium">
                                    More info on Iridium
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">Core Stack</h3>
                        <ul className="flex flex-col gap-1">
                            <li>
                                <a
                                    href="https://typescriptlang.org/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    TypeScript
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://react.dev/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    React
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://reactrouter.com/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    React Router
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">
                            Authentication & UI
                        </h3>
                        <ul className="flex flex-col gap-1">
                            <li>
                                <a
                                    href="https://www.better-auth.com/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    BetterAuth
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://tailwindcss.com/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Tailwind CSS
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://daisyui.com/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    DaisyUI
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">Services</h3>
                        <ul className="flex flex-col gap-1">
                            <li>
                                <a
                                    href="https://railway.com/deploy/?referralCode=YZe1VE"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Railway
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://resend.com"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Resend
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </Container>
        </footer>
    );
}
