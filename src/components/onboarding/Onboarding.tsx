import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Users,
  FolderKanban,
  BadgeCheck,
  DollarSign,
  MessageSquare,
  Presentation,
  FileText,
  ArrowRight,
  ArrowLeft,
  Rocket,
} from "lucide-react";
import logoSvg from "@/assets/logo.svg";
import { cn } from "@/lib/utils";

interface OnboardingProps {
  onComplete: () => void;
}

interface Step {
  title: string;
  description: string;
  features?: { icon: React.ElementType; label: string; detail: string }[];
}

const steps: Step[] = [
  {
    title: "Welcome to MySquad",
    description:
      "Your all-in-one team management app. Track your team members, run effective 1:1s, plan salaries, and stay on top of projects — all in one secure place.",
  },
  {
    title: "Your Team",
    description:
      "Start by adding your team members. Keep track of roles, contact info, and reporting structure.",
    features: [
      {
        icon: Users,
        label: "Team Members",
        detail: "Add members with titles, start dates, and contact details",
      },
      {
        icon: BadgeCheck,
        label: "Titles & Roles",
        detail: "Define job titles and assign them to team members",
      },
    ],
  },
  {
    title: "Meetings & Topics",
    description:
      "Never go into a 1:1 unprepared. Track discussion topics and meeting notes for each team member.",
    features: [
      {
        icon: MessageSquare,
        label: "Talk Topics",
        detail: "Queue up topics to discuss in your next 1:1",
      },
      {
        icon: Presentation,
        label: "Team Meetings",
        detail: "Run all-hands with escalated topics and project updates",
      },
    ],
  },
  {
    title: "Plan & Report",
    description: "Stay organized with project tracking, salary planning, and customizable reports.",
    features: [
      {
        icon: FolderKanban,
        label: "Projects",
        detail: "Track projects and assign team members to them",
      },
      {
        icon: DollarSign,
        label: "Salary Planner",
        detail: "Plan salaries, compare scenarios, and track budgets",
      },
      {
        icon: FileText,
        label: "Reports",
        detail: "Build custom dashboards with drag-and-drop blocks",
      },
    ],
  },
];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex w-full max-w-lg flex-col items-center px-6">
        {/* Logo (welcome step only) */}
        {isFirst && <img src={logoSvg} alt="MySquad" className="mb-6 h-20 w-20" />}

        {/* Step content */}
        <h1 className="text-center text-2xl font-bold tracking-tight">{step.title}</h1>
        <p className="mt-3 text-center text-muted-foreground leading-relaxed">{step.description}</p>

        {/* Feature cards */}
        {step.features && (
          <div className="mt-6 w-full space-y-3">
            {step.features.map((feature) => (
              <div key={feature.label} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{feature.label}</p>
                  <p className="text-xs text-muted-foreground">{feature.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progress dots */}
        <div className="mt-8 flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === currentStep ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex gap-3">
          {!isFirst && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep((s) => s - 1)}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          {isLast ? (
            <Button onClick={onComplete} className="gap-1.5">
              Get Started
              <Rocket className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => setCurrentStep((s) => s + 1)} className="gap-1.5">
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Skip link */}
        {!isLast && (
          <button
            onClick={onComplete}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip intro
          </button>
        )}
      </div>
    </div>
  );
}
