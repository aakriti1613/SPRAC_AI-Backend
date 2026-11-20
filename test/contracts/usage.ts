// Compile-only check of the generated contracts (run by test/sparc.test.js with tsc).
// Lines marked @ts-expect-error MUST fail to compile — that proves the contract
// really enforces required props and types.
import type {
  DataTableProps,
  FormFieldProps,
  HeroProps,
  LoginProps,
  RoomId,
  RoomPropsMap,
  StyleLevel,
} from "../../sparc-ui/contracts/rooms";

// A minimal valid hero.
export const hero: HeroProps = { title: "Sunrise Clinic", primaryCta: { label: "Book", href: "/book" } };

// A component written against the login contract.
export function LoginSkin(props: LoginProps): string {
  return `${props.brand.name}: ${props.headline}${props.error ? ` (${props.error})` : ""}`;
}

// Field values may be anything; field types are a closed list.
export const currencyField: FormFieldProps = {
  field: { key: "fee_paid", label: "Fee paid", type: "currency", required: false },
  value: 1200,
  onChange: () => {},
};

export const table: DataTableProps = {
  columns: [{ key: "name", label: "Name", sortable: true }],
  rows: [{ name: "Riya" }],
  loading: false,
  page: { page: 1, pageSize: 10, total: 1 },
  onPageChange: () => {},
};

// Room ids and the props map line up.
export const roomIds: RoomId[] = ["hero", "login", "form-field"];
export function propsFor<K extends RoomId>(_room: K, props: RoomPropsMap[K]): RoomPropsMap[K] {
  return props;
}
propsFor("hero", hero);
export const level: StyleLevel = "amazing";

// ---- These must NOT compile ----
// @ts-expect-error title is required
export const heroWithoutTitle: HeroProps = {};

// @ts-expect-error unknown field type
export const badField: FormFieldProps = { field: { key: "x", label: "X", type: "money", required: false }, value: 1, onChange: () => {} };

// @ts-expect-error onSubmit must return a Promise
export const badLogin: LoginProps = { brand: { name: "A" }, headline: "h", submitting: false, onSubmit: () => 1 };

// @ts-expect-error not a room
export const notARoom: RoomId = "carousel";

// @ts-expect-error not a style level
export const badLevel: StyleLevel = "ultra";
