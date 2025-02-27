import { StepErrorBoundary } from './StepErrorBoundary';
import { fetchIntegrationJson, RequestService } from '@kaoto/api';
import { useFlowsStore, useIntegrationSourceStore, useSettingsStore } from '@kaoto/store';
import { CodeEditorMode } from '@kaoto/types';
import { CodeEditor, CodeEditorControl, Language } from '@patternfly/react-code-editor';
import { Alert } from '@patternfly/react-core';
import { CheckCircleIcon, EraserIcon, RedoIcon, UndoIcon } from '@patternfly/react-icons';
import { setDiagnosticsOptions } from 'monaco-yaml';
import { useEffect, useRef } from 'react';
import { EditorDidMount } from 'react-monaco-editor';
import { useDebouncedCallback } from 'use-debounce';
import { shallow } from 'zustand/shallow';

interface ISourceCodeEditor {
  initialData?: string;
  language?: Language;
  theme?: string;
  mode?: CodeEditorMode;
  schemaUri?: string;
  editable?: boolean | false;
  syncAction?: () => {};
}

export const SourceCodeEditor = (props: ISourceCodeEditor) => {
  const editorRef = useRef<Parameters<EditorDidMount>[0] | null>(null);
  const { sourceCode, setSourceCode } = useIntegrationSourceStore();
  const syncedSourceCode = useIntegrationSourceStore((state) => state.syncedSourceCode, shallow);
  const { schemaUri, currentDsl, capabilities, editorIsLightMode, setSettings } = useSettingsStore(
    (state) => ({
      schemaUri: state.settings.dsl.validationSchema
        ? RequestService.getApiURL() + state.settings.dsl.validationSchema
        : '',
      currentDsl: state.settings.dsl.name,
      capabilities: state.settings.capabilities,
      editorIsLightMode: state.settings.editorIsLightMode,
      setSettings: state.setSettings,
    }),
    shallow,
  );

  const setFlowsWrapper = useFlowsStore((state) => state.setFlowsWrapper, shallow);

  useEffect(() => {
    setDiagnosticsOptions({
      enableSchemaRequest: schemaUri !== '',
      hover: false,
      completion: true,
      validate: schemaUri !== '',
      format: true,
      schemas: [
        {
          uri: schemaUri,
          fileMatch: ['*'],
        },
      ],
    });
  }, [schemaUri]);

  /**
   * On detected changes to YAML state, issue POST to external endpoint
   * Returns JSON to be displayed in the visualization
   */
  const handleChanges = (incomingData: string) => {
    // update integration JSON state with changes
    fetchIntegrationJson(incomingData, currentDsl)
      .then((flowsWrapper) => {
        const newDsl = flowsWrapper.flows?.[0].dsl ?? '';

        if (newDsl !== currentDsl) {
          const dsl = capabilities.find((dsl) => dsl.name === newDsl);
          setSettings({ dsl });
        }

        setFlowsWrapper(flowsWrapper);
      })
      .catch((e) => {
        console.error(e);
      });
  };

  const handleEditorDidMount: EditorDidMount = (editor) => {
    const messageContribution: any = editor?.getContribution('editor.contrib.messageController');
    editor?.onDidAttemptReadOnlyEdit(() => {
      messageContribution?.showMessage(
        'Cannot edit in read-only editor mode.',
        editor.getPosition(),
      );
    });

    editor?.revealLine(editor.getModel()?.getLineCount() ?? 0);
    editorRef.current = editor;
  };

  const debounced = useDebouncedCallback((value: string) => {
    if (props.mode === CodeEditorMode.TWO_WAY_SYNC) {
      handleChanges(value);
    }
  }, 1000);

  const syncChanges = (value: string) => {
    setSourceCode(value);
    debounced(value);
  };

  const clearAction = () => {
    setSourceCode('');
  };
  const undoAction = () => {
    (editorRef.current?.getModel() as any)?.undo();
  };

  const redoAction = () => {
    (editorRef.current?.getModel() as any)?.redo();
  };
  const updateModelFromTheEditor = () => {
    const updatedCode = editorRef.current?.getValue();
    if (updatedCode) {
      handleChanges(updatedCode);
    }
  };

  const ClearButton = (
    <CodeEditorControl
      key={'clearButton'}
      icon={<EraserIcon />}
      data-testid={'sourceCode--clearButton'}
      onClick={clearAction}
      isVisible={sourceCode !== ''}
      tooltipProps={{ content: 'Clear', position: 'top' }}
    />
  );

  const UndoButton = (
    <CodeEditorControl
      key="undoButton"
      icon={<UndoIcon />}
      aria-label="Undo change"
      data-testid={'sourceCode--undoButton'}
      onClick={undoAction}
      isVisible={sourceCode !== ''}
      tooltipProps={{ content: 'Undo change', position: 'top' }}
    />
  );

  const RedoButton = (
    <CodeEditorControl
      key="redoButton"
      icon={<RedoIcon />}
      aria-label="Redo change"
      data-testid={'sourceCode--redoButton'}
      onClick={redoAction}
      isVisible={sourceCode !== ''}
      tooltipProps={{ content: 'Redo change', position: 'top' }}
    />
  );

  const UpdateButton = (
    <CodeEditorControl
      key="updateButton"
      icon={<CheckCircleIcon color={'green'} />}
      aria-label="Apply the code"
      data-testid={'sourceCode--applyButton'}
      onClick={updateModelFromTheEditor}
      tooltipProps={{ content: 'Sync your code', position: 'top' }}
      isVisible={sourceCode !== '' && props.mode === CodeEditorMode.FREE_EDIT}
    />
  );

  return (
    <StepErrorBoundary>
      {syncedSourceCode !== sourceCode && (
        <Alert
          title="Any invalid code will be replaced after sync. If you don't want to lose your changes
          please make a backup."
          variant="warning"
        ></Alert>
      )}
      <CodeEditor
        code={sourceCode ?? props.initialData}
        className="code-editor"
        height="80vh"
        width="100%"
        onCodeChange={syncChanges}
        language={Language.yaml}
        onEditorDidMount={handleEditorDidMount}
        toolTipPosition="top"
        customControls={[UndoButton, RedoButton, ClearButton, UpdateButton]}
        isCopyEnabled
        isDarkTheme={!editorIsLightMode}
        isDownloadEnabled
        isLanguageLabelVisible
        allowFullScreen={true}
        isUploadEnabled
        options={{
          readOnly: props.mode === CodeEditorMode.READ_ONLY,
          scrollbar: {
            horizontal: 'visible',
            vertical: 'visible',
          },
          quickSuggestions: { other: true, strings: true },
        }}
      />
    </StepErrorBoundary>
  );
};
