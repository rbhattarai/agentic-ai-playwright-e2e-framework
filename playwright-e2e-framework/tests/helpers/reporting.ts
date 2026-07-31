import { Page, TestStepInfo } from '@playwright/test';

type StepExecutor = {
  step: <T>(title: string, body: (step: TestStepInfo) => Promise<T>) => Promise<T>;
};

type StepScreenshotOptions = {
  fullPage?: boolean;
  screenshotName?: string;
  skipScreenshot?: boolean;
};

export async function attachStepScreenshot(
  step: TestStepInfo,
  page: Page,
  stepName: string,
  options?: Pick<StepScreenshotOptions, 'fullPage'>
): Promise<void> {
  await step.attach(toAttachmentName(stepName), {
    body: await page.screenshot({ fullPage: options?.fullPage ?? true }),
    contentType: 'image/png',
  });
}

export async function stepWithScreenshot<T>(
  stepper: StepExecutor,
  title: string,
  page: Page,
  body: (step: TestStepInfo) => Promise<T>,
  options?: StepScreenshotOptions
): Promise<T> {
  return stepper.step(title, async (step) => {
    const result = await body(step);

    if (!options?.skipScreenshot) {
      await attachStepScreenshot(step, page, options?.screenshotName || title, {
        fullPage: options?.fullPage,
      });
    }

    return result;
  });
}

function toAttachmentName(stepName: string): string {
  return `${stepName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-screenshot`;
}