#!/usr/bin/env node
/**
 * Scaffold a new composition and register it in src/Root.tsx.
 *
 *   npm run new -- ProductLaunch
 *
 * Creates src/compositions/ProductLaunch/ProductLaunch.tsx from a starter
 * template and adds a <Composition id="ProductLaunch"> registration.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootFile = join(root, "src", "Root.tsx");
const IMPORT_MARKER = "// new-composition:imports";
const REGISTRATION_MARKER = "{/* new-composition:registrations */}";

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const name = process.argv[2];
if (!name) {
  fail("Pass a composition name, e.g. npm run new -- ProductLaunch");
}
if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
  fail(`"${name}" must be PascalCase letters and digits (e.g. ProductLaunch).`);
}

const dir = join(root, "src", "compositions", name);
const file = join(dir, `${name}.tsx`);
if (existsSync(dir)) {
  fail(`${relative(root, dir)} already exists.`);
}

const rootSource = readFileSync(rootFile, "utf8");
if (
  !rootSource.includes(IMPORT_MARKER) ||
  !rootSource.includes(REGISTRATION_MARKER)
) {
  fail(
    `Could not find the new-composition markers in src/Root.tsx. Register ${name} by hand.`,
  );
}
if (rootSource.includes(`id="${name}"`)) {
  fail(`A composition with id "${name}" is already registered.`);
}

// "ProductLaunch" -> "Product Launch"
const title = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

const template = `import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { AnimatedTitle, Background, Eyebrow } from "../../components";
import { useLayout } from "../../lib/layout";
import { colors, fonts } from "../../theme";

export const ${name}Schema = z.object({
  eyebrow: z.string(),
  title: z.string(),
  subtitle: z.string(),
});

type ${name}Props = z.infer<typeof ${name}Schema>;

export const ${name}: React.FC<${name}Props> = ({ eyebrow, title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px, safeX } = useLayout();

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", gap: px(40), padding: \`0 \${safeX}px\` }}
      >
        <Eyebrow text={eyebrow} />
        <AnimatedTitle text={title} delay={Math.round(0.3 * fps)} style={{ fontSize: px(140) }} />
        <p
          style={{
            margin: 0,
            fontFamily: fonts.body,
            fontSize: px(46),
            color: colors.muted,
            opacity: interpolate(frame, [1 * fps, 1.8 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {subtitle}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
`;

const registration = `<Composition
        id="${name}"
        component={${name}}
        schema={${name}Schema}
        {...VIDEO}
        durationInFrames={secondsToFrames(5, VIDEO.fps)}
        defaultProps={{
          eyebrow: "Kanso Studio",
          title: "${title}",
          subtitle: "Edit src/compositions/${name}/${name}.tsx",
        }}
      />

      ${REGISTRATION_MARKER}`;

mkdirSync(dir, { recursive: true });
writeFileSync(file, template);
writeFileSync(
  rootFile,
  rootSource
    .replace(
      IMPORT_MARKER,
      `import { ${name}, ${name}Schema } from "./compositions/${name}/${name}";\n${IMPORT_MARKER}`,
    )
    .replace(REGISTRATION_MARKER, registration),
);

console.log(`✔ Created ${relative(root, file)}`);
console.log(`✔ Registered <Composition id="${name}"> in src/Root.tsx`);
console.log("");
console.log(`Preview: npm run dev   (then pick "${name}" in the sidebar)`);
console.log(`Render:  npx remotion render ${name} out/${name}.mp4`);
