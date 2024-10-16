/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import '@testing-library/jest-dom/vitest';
import { vi, beforeEach, test, expect } from 'vitest';
import { studioClient } from '/@/utils/client';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CreateService from '/@/pages/CreateService.svelte';
import type { Task } from '@shared/src/models/ITask';
import userEvent from '@testing-library/user-event';
import type { InferenceServer } from '@shared/src/models/IInference';

const mocks = vi.hoisted(() => {
  return {
    // models store
    modelsInfoSubscribeMock: vi.fn(),
    modelsInfoQueriesMock: {
      subscribe: (f: (msg: any) => void) => {
        f(mocks.modelsInfoSubscribeMock());
        return () => {};
      },
    },
    // server store
    getInferenceServersMock: vi.fn(),
    // tasks store
    tasksSubscribeMock: vi.fn(),
    tasksQueriesMock: {
      subscribe: (f: (msg: any) => void) => {
        f(mocks.tasksSubscribeMock());
        return () => {};
      },
    },
  };
});

vi.mock('../stores/inferenceServers', () => ({
  inferenceServers: {
    subscribe: (f: (msg: any) => void) => {
      f(mocks.getInferenceServersMock());
      return () => {};
    },
  },
}));

vi.mock('../stores/modelsInfo', async () => {
  return {
    modelsInfo: mocks.modelsInfoQueriesMock,
  };
});

vi.mock('../stores/tasks', async () => {
  return {
    tasks: mocks.tasksQueriesMock,
  };
});

vi.mock('../utils/client', async () => ({
  studioClient: {
    requestCreateInferenceServer: vi.fn(),
    getHostFreePort: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.modelsInfoSubscribeMock.mockReturnValue([]);
  mocks.tasksSubscribeMock.mockReturnValue([]);

  vi.mocked(studioClient.requestCreateInferenceServer).mockResolvedValue('dummyTrackingId');
  vi.mocked(studioClient.getHostFreePort).mockResolvedValue(8888);
  mocks.getInferenceServersMock.mockReturnValue([
    { container: { containerId: 'dummyContainerId' } } as InferenceServer,
  ]);
});

test('create button should be disabled when no model id provided', async () => {
  render(CreateService);

  await vi.waitFor(() => {
    const createBtn = screen.getByTitle('Create service');
    expect(createBtn).toBeDefined();
    expect(createBtn.attributes.getNamedItem('disabled')).toBeTruthy();
  });
});

test('expect error message to be displayed when no model locally', async () => {
  render(CreateService);

  await vi.waitFor(() => {
    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
  });
});

test('expect error message to be hidden when models locally', () => {
  mocks.modelsInfoSubscribeMock.mockReturnValue([{ id: 'random', file: true }]);
  render(CreateService);

  const alert = screen.queryByRole('alert');
  expect(alert).toBeNull();
});

test('button click should call createInferenceServer', async () => {
  mocks.modelsInfoSubscribeMock.mockReturnValue([{ id: 'random', file: true }]);
  render(CreateService);

  let createBtn: HTMLElement | undefined = undefined;
  await vi.waitFor(() => {
    createBtn = screen.getByTitle('Create service');
    expect(createBtn).toBeDefined();
  });

  if (createBtn === undefined) throw new Error('createBtn undefined');

  await fireEvent.click(createBtn);
  expect(vi.mocked(studioClient.requestCreateInferenceServer)).toHaveBeenCalledWith({
    modelsInfo: [{ id: 'random', file: true }],
    port: 8888,
  });
});

test('tasks progress should not be visible by default', async () => {
  render(CreateService);

  const status = screen.queryByRole('status');
  expect(status).toBeNull();
});

test('tasks should be displayed after requestCreateInferenceServer', async () => {
  mocks.modelsInfoSubscribeMock.mockReturnValue([{ id: 'random', file: true }]);

  let listener: ((tasks: Task[]) => void) | undefined;
  vi.spyOn(mocks.tasksQueriesMock, 'subscribe').mockImplementation((f: (tasks: Task[]) => void) => {
    listener = f;
    listener([]);
    return () => {};
  });

  render(CreateService);

  // wait for listener to be defined
  await vi.waitFor(() => {
    expect(listener).toBeDefined();
  });

  let createBtn: HTMLElement | undefined = undefined;
  await vi.waitFor(() => {
    createBtn = screen.getByTitle('Create service');
    expect(createBtn).toBeDefined();
  });

  if (createBtn === undefined || listener === undefined) throw new Error('properties undefined');

  await fireEvent.click(createBtn);

  await vi.waitFor(() => {
    expect(studioClient.requestCreateInferenceServer).toHaveBeenCalled();
  });

  listener([
    {
      id: 'dummyTaskId',
      labels: {
        trackingId: 'dummyTrackingId',
      },
      name: 'Dummy Task name',
      state: 'loading',
    },
  ]);

  await vi.waitFor(() => {
    const status = screen.getByRole('status');
    expect(status).toBeDefined();
  });
});

test('should display error message if createService fails', async () => {
  mocks.modelsInfoSubscribeMock.mockReturnValue([{ id: 'random', file: true }]);

  let listener: ((tasks: Task[]) => void) | undefined;
  vi.spyOn(mocks.tasksQueriesMock, 'subscribe').mockImplementation((f: (tasks: Task[]) => void) => {
    listener = f;
    listener([]);
    return () => {};
  });

  vi.mocked(studioClient.requestCreateInferenceServer).mockRejectedValue('error creating service');
  render(CreateService);

  let createBtn: HTMLElement | undefined = undefined;
  await vi.waitFor(() => {
    createBtn = screen.getByTitle('Create service');
    expect(createBtn).toBeDefined();
  });

  if (createBtn === undefined) throw new Error('createBtn undefined');

  const errorMessage = screen.queryByLabelText('Error Message Content');
  expect(errorMessage).not.toBeInTheDocument();

  await userEvent.click(createBtn);

  const errorMessageAfterSubmit = screen.getByLabelText('Error Message Content');
  expect(errorMessageAfterSubmit).toBeInTheDocument();
  expect(errorMessageAfterSubmit?.textContent).equal('error creating service');
});
