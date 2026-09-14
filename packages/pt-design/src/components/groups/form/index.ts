import type { PtComponentModule } from "./contract";
import {
  buttonModule,
  calendarModule,
  checkboxModule,
  datePickerModule,
  inputModule,
  inputOtpModule,
  labelModule,
  sliderModule,
  switchModule,
  textareaModule,
  toggleModule,
} from "./controls";
import {
  comboboxModule,
  nativeSelectModule,
  radioGroupModule,
  selectModule,
  toggleGroupModule,
} from "./lists";
import { bindFormModules } from "./runtime";
import { buttonGroupModule, fieldModule, formModule, inputGroupModule } from "./trees";

export type { PtComponentModule, PtInspectorField, PtRendererProps } from "./contract";

export const FORM_MODULES: readonly PtComponentModule[] = [
  buttonModule,
  buttonGroupModule,
  checkboxModule,
  comboboxModule,
  datePickerModule,
  fieldModule,
  formModule,
  inputModule,
  inputGroupModule,
  inputOtpModule,
  labelModule,
  nativeSelectModule,
  radioGroupModule,
  selectModule,
  sliderModule,
  switchModule,
  textareaModule,
  toggleModule,
  toggleGroupModule,
  calendarModule,
];

bindFormModules(FORM_MODULES);
